// POST /api/merge
// 入参: { storyboard, assets }  (assets: { sceneId, videoUrl, audioUrl }[])
// 出参: video/mp4 (final.mp4 二进制)
//
// 流程: 下载所有 clip / audio → 每段 ffmpeg 混音 + 字幕 → concat → 流式返回

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SceneAsset, Storyboard } from "@/lib/types";

// ffmpeg-static 包提供一个跨平台二进制路径
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface Body {
  storyboard: Storyboard;
  assets: SceneAsset[];
}

async function downloadTo(url: string, dest: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}: ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(dest, buf);
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}\n${stderr.slice(-1500)}`));
    });
  });
}

function probeDuration(cmd: string, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // ffprobe 通常和 ffmpeg 在同一目录；这里直接用 ffmpeg 走 -i 解析
    // 为减少依赖，用 ffmpeg 自身 + format 输出
    // ffmpeg prints "Duration:" at info level; -v error would suppress it.
    const p = spawn(cmd, [
      "-hide_banner",
      "-i", path,
      "-f", "null", "-",
    ]);
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    p.on("close", () => {
      // ffmpeg 不会直接打印 duration，这里用更可靠的方式：寻找 "Duration: HH:MM:SS.xx"
      const m = stderr.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
      if (!m) return reject(new Error("无法解析视频时长"));
      const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
      resolve(sec);
    });
    p.on("error", reject);
  });
}

function escDrawtext(s: string): string {
  return s
    .replace(/[\r\n]+/g, " ") // 旁白若含换行会破坏 drawtext，压成单行
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,");
}

export async function POST(req: Request) {
  const FFMPEG = (ffmpegPath as unknown as string) || "ffmpeg";

  const body = (await req.json()) as Body;
  if (!body.storyboard || !body.assets) {
    return new Response(JSON.stringify({ error: "缺少 storyboard 或 assets" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const work = await mkdtemp(join(tmpdir(), "svf-"));
  try {
    const assetMap = new Map(body.assets.map((a) => [a.sceneId, a]));
    const fontCandidates = [
      "/System/Library/Fonts/PingFang.ttc",
      "/System/Library/Fonts/STHeiti Light.ttc",
      "/System/Library/Fonts/Hiragino Sans GB.ttc",
      "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
      "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    ];
    const fs = await import("node:fs/promises");
    let font: string | null = null;
    for (const c of fontCandidates) {
      try { await fs.access(c); font = c; break; } catch {}
    }

    const mixedFiles: string[] = [];
    for (const s of body.storyboard.scenes) {
      const a = assetMap.get(s.id);
      if (!a?.videoUrl || !a?.audioUrl) continue;

      const vPath = join(work, `clip_${s.id}.mp4`);
      const aPath = join(work, `audio_${s.id}.mp3`);
      await Promise.all([
        downloadTo(a.videoUrl, vPath),
        downloadTo(a.audioUrl, aPath),
      ]);

      const dur = await probeDuration(FFMPEG, vPath);

      const text = escDrawtext(s.narration);
      const drawText = font
        ? `drawtext=fontfile='${font}':text='${text}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=h-text_h-60`
        : `drawtext=text='${text}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-text_w)/2:y=h-text_h-60`;

      const outPath = join(work, `mixed_${s.id}.mp4`);
      await run(FFMPEG, [
        "-y",
        "-i", vPath,
        "-i", aPath,
        "-filter_complex", `[0:v]${drawText}[v];[1:a]apad[a]`,
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-t", String(dur),
        outPath,
      ]);
      mixedFiles.push(outPath);
    }

    if (mixedFiles.length === 0) {
      return new Response(JSON.stringify({ error: "没有可合成的分镜" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const listFile = join(work, "concat.txt");
    await writeFile(
      listFile,
      mixedFiles.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    );

    const finalPath = join(work, "final.mp4");
    await run(FFMPEG, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", listFile,
      "-c", "copy",
      finalPath,
    ]);

    const buf = await readFile(finalPath);
    return new Response(buf, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename="short-video-${Date.now()}.mp4"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  } finally {
    rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

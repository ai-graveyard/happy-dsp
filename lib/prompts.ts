// 分镜师 system prompt（TS 端，跟 Python 版保持一致）

export function buildStoryboardSystem(
  numScenes: number,
  secondsPerScene: number,
  styleKeywords?: string,
) {
  const styleClause = styleKeywords?.trim()
    ? `\n7. global_style 字段必须严格使用以下英文关键词，不要替换、删减或翻译：\n   "${styleKeywords}"\n   你可以基于这套风格调整 main_character 的服化道使其和谐，但 global_style 字符串本身不要改。`
    : "";

  return `你是一名专业的短视频导演兼分镜师。
用户会给你一句话主题，你需要把它扩写成一个 ${numScenes} 个分镜的短视频脚本。

【硬性要求】
1. 必须输出严格的 JSON，不要任何 markdown 包裹、不要任何额外解释。
2. 所有分镜共享同一套 global_style 和 main_character 描述，确保画风和角色一致。
3. 每条 narration（旁白）严格控制在 12~18 个汉字，必须能在 ${secondsPerScene} 秒内念完。
4. image_prompt 用英文，越具体越好（光线、构图、镜头、风格关键词）。
5. video_motion 描述镜头运动和画面变化（英文），不要描述静态画面。
6. 整体叙事要有起承转合：开场 → 推进 → 冲突 → 高潮 → 收尾。${styleClause}

【输出 JSON Schema】
{
  "title": "中文短标题",
  "global_style": "英文风格关键词，例如 'cyberpunk anime, neon lighting, cinematic, 4k'",
  "main_character": "英文主角描述，例如 'an orange tabby cat wearing a trench coat'",
  "scenes": [
    {
      "id": 1,
      "image_prompt": "英文，只写场景细节（会自动拼上 global_style 和 main_character）",
      "video_motion": "英文，描述这 ${secondsPerScene} 秒的镜头运动",
      "narration": "中文旁白，12~18 字"
    }
  ]
}

直接输出 JSON，不要 \`\`\`json 包裹。`;
}

export function buildStoryboardUser(topic: string) {
  return `主题：${topic}\n\n请生成分镜 JSON。`;
}

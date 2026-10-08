# 接口约定

业务后端前缀 `/api`。Express 调用 FastAPI，超时 8 秒。模型失败时工单仍会保存。

## 业务接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /api/health | 数据库和模型服务状态 |
| POST | /api/tickets | 创建工单并尝试分类 |
| GET | /api/tickets | 搜索、筛选、分页 |
| GET | /api/tickets/:id | 详情、预测历史、复核记录、操作历史 |
| PATCH | /api/tickets/:id | 更新处理状态和备注 |
| POST | /api/tickets/:id/review | 确认或纠正类别 |
| POST | /api/tickets/:id/retry-classification | 重试分类 |
| GET | /api/stats | 业务统计 |
| GET | /api/model-results | 离线实验结果 |
| GET | /api/feedback/export | 人工反馈 CSV |

### POST /api/tickets

请求：`{ "project": "facebook/react", "title": "...", "body": "..." }`

项目必须是五个仓库之一。标题 1–200 字，正文 1–20000 字。

响应：`{ "ticket": {...}, "classificationError": null | "原因" }`

### GET /api/tickets

查询参数：`q`, `project`, `predictedLabel`, `confirmedLabel`, `queue`, `processStatus`, `reviewStatus`, `classificationStatus`, `page`, `pageSize`。

### POST /api/tickets/:id/review

请求：`{ "action": "confirm" | "correct", "label": "bug", "note": "可选" }`。纠正时必须带 `label`。

### GET /api/stats

查询参数：`project`, `from`, `to`。日期格式 `YYYY-MM-DD`。

错误响应：`{ "error": { "code": "VALIDATION", "message": "..." } }`

## 模型服务

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /health | 服务是否已加载模型 |
| POST | /predict | `{ title, body }` → `{ label, scores, modelVersion }` |

空标题返回 422。

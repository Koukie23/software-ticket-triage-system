# 数据库表结构

数据库使用 PostgreSQL。表定义见 [backend/sql/init.sql](../backend/sql/init.sql)。服务启动时会自动执行该脚本。

## tickets

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | UUID | 主键 |
| project | VARCHAR(128) | 五个仓库之一 |
| title | TEXT | 问题标题 |
| body | TEXT | 问题正文 |
| process_status | VARCHAR | pending / in_progress / resolved |
| classification_status | VARCHAR | pending / classified / failed |
| review_status | VARCHAR | auto / pending / confirmed，未分类时为空 |
| predicted_label | VARCHAR | 当前模型预测类别 |
| confirmed_label | VARCHAR | 人工确认类别，未确认时为空 |
| queue | VARCHAR | 缺陷处理 / 功能需求 / 技术支持 / 人工复核 |
| note | TEXT | 处理备注 |
| classification_error | TEXT | 最近一次分类失败原因 |
| created_at / updated_at | TIMESTAMPTZ | 时间 |

## predictions

每次分类新增一行，不覆盖旧预测。`is_current` 标记当前预测。

| 字段 | 说明 |
| --- | --- |
| model_version | 模型版本 |
| predicted_label | 预测类别 |
| score_bug / score_feature / score_question | 三类分数 |
| confidence | 最高分 |
| threshold_used | 当时使用的复核阈值 |
| queue | 当时按规则算出的队列 |

## reviews

人工确认或纠正记录。纠错后工单队列按确认类别重算，预测分数不变。

## ticket_events

操作历史：创建、分类成功、分类失败、状态变更、备注、确认、纠正。

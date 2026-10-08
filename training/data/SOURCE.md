# 数据来源

- 数据集：NLBSE'24 Tool Competition on Issue Report Classification
- 地址：https://github.com/nlbse2024/issue-report-classification
- 下载文件：`issues_train.csv`、`issues_test.csv`
- 原始字段：`repo`, `created_at`, `label`, `title`, `body`
- 标签：`bug`、`feature`、`question`。各 500 条，训练与测试各 1500 条。
- 仓库：`facebook/react`、`tensorflow/tensorflow`、`microsoft/vscode`、`bitcoin/bitcoin`、`opencv/opencv`。每个划分中每个仓库 300 条。

本项目把 `repo` 视为文档中的 Repository。`created_at` 只用于数据核对，不作为分类特征，避免把时间信息泄漏进模型。

官方测试集不参与训练、调参或阈值选择。验证集从官方训练集按「仓库 + 标签」分层划出 20%，随机种子 42。

与竞赛设定的差异：竞赛要求每个仓库单独训练分类器。本项目把五个仓库的训练样本合并，训练一个通用三分类器，并分别报告各仓库指标。

原始 CSV 与处理后的划分不提交到版本库。运行 `training/scripts/prepare_data.py` 可重新下载并生成划分。

# 数据说明

来源：<https://github.com/nlbse2024/issue-report-classification>。

原始文件字段是 `repo`、`created_at`、`label`、`title`、`body`。建模使用仓库、标题和正文。`created_at` 不进入模型。

- 官方训练集 1500 条，其中训练 1200 条、验证 300 条。
- 官方测试集 1500 条，不参与训练、调参或阈值选择。
- 划分方式：按仓库 + 标签分层，验证集比例 0.2，随机种子 42。
- 官方训练集中移除的 NUL 字节：0。测试集：1。
- 标题为空：官方训练集 0，测试集 0。
- 正文为空：官方训练集 0，测试集 2。
- 官方训练集内部重复（标题+正文）1 条。
- 测试集内部重复 0 条。
- 官方训练集与测试集交叉重复 3 条。
- 本项目训练集与验证集交叉重复 0 条。

五个仓库合并为一个通用分类器。这与 NLBSE 竞赛“每个仓库单独训练”的设定不同，实验页会另报各仓库 Macro-F1。

分析图：`training/results/figures/label_distribution.png`、`repo_distribution.png`、`length_hist.png`。

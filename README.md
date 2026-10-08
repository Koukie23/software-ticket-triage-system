# 软件问题工单分类与辅助分流系统

基于预训练语言模型的软件问题工单分类与辅助分流系统。提交英文问题后，模型预测 `bug` / `feature` / `question`，业务规则分配队列；低置信分数进入人工复核。

本项目把五个仓库的样本合并，训练一个通用三分类器，并分别报告各仓库指标。这与 NLBSE 2024 竞赛“每个仓库单独训练”的设定不同。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design、ECharts
- 业务后端：Node.js、Express、TypeScript、PostgreSQL
- 模型服务：Python、FastAPI
- 训练：scikit-learn、PyTorch、Hugging Face Transformers（DistilBERT）

## 本机启动（无 Docker）

本机已验证使用 Postgres.app 和 conda 环境 `issue-triage`。当前环境没有 Docker 时，用下面的方式启动。

1. 复制 `.env.example` 为 `.env`。
2. 创建数据库和账号（只需一次）：

```bash
psql -d postgres -c "CREATE ROLE triage LOGIN PASSWORD 'triage';"
psql -d postgres -c "CREATE DATABASE triage OWNER triage;"
```

3. 准备数据和基线模型：

```bash
conda activate issue-triage
python training/scripts/prepare_data.py
python training/scripts/train_baseline.py
```

4. 启动模型服务、业务后端和前端（三个终端）：

```bash
conda activate issue-triage
cd model_service
PYTHONPATH=../training uvicorn app:app --host 127.0.0.1 --port 8000
```

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

5. 浏览器打开 http://127.0.0.1:5173 。写入演示工单：

```bash
cd backend
npm run seed
```

`npm run seed -- --reset` 会先清空工单再写入。

## 深度模型实验

```bash
conda activate issue-triage
python training/scripts/train_experiments.py
```

脚本会训练 DistilBERT、完成三组对比、在验证集上选阈值，然后只评估一次测试集。完成后会覆盖 `models/deployed` 和 `training/results/model_results.json`。重启模型服务后才会加载新模型。

## Docker Compose

本机当前没有 Docker。若已安装：

```bash
python training/scripts/prepare_data.py
python training/scripts/train_baseline.py
docker compose up --build
```

前端映射到 http://127.0.0.1:8080 ，数据保存在 `pgdata` 卷中，重启后仍在。

## 模型文件

训练后的权重在 `models/`，不提交到 Git。基线体积小，可本地复现。DistilBERT 微调结果应放到可访问的网盘或 Hugging Face，并在提交材料的 `application` 文件夹写下载链接。

## 目录

- `frontend/` 五个页面
- `backend/` 工单、分流、统计 API
- `model_service/` 推理服务
- `training/` 数据、基线、实验
- `docs/` 数据说明、表结构、接口

## 课程交付

报告 Word 模板、VeriGuide 和演示视频不在本仓库。模板到齐后再单独整理 PDF、视频和压缩包。

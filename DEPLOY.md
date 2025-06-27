# Google Cloud デプロイメント手順

## 前提条件
- Google Cloud アカウント
- Google Cloud CLI (gcloud) がインストールされていること
- プロジェクトが設定されていること
- Google AI API キーを取得済み

## Secret Manager の設定

APIキーを安全に管理するため、Google Secret Managerを使用します：

```bash
# Secret を作成（既に作成済みの場合はスキップ）
echo -n "your-api-key-here" | gcloud secrets create google-generative-ai-api-key --data-file=-

# Cloud Run サービスアカウントにアクセス権限を付与
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding google-generative-ai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## デプロイ手順

### 1. Google Cloud にログイン
```bash
gcloud auth login
```

### 2. プロジェクトを設定
```bash
gcloud config set project YOUR_PROJECT_ID
```

### 3. Cloud Run API を有効化
```bash
gcloud services enable run.googleapis.com
```

### 4. Cloud Build を使用してデプロイ（推奨）

プロジェクトには `cloudbuild.yaml` が含まれており、自動デプロイが可能です：

```bash
# Cloud Build でデプロイ
gcloud builds submit --config=cloudbuild.yaml
```

カスタム設定でデプロイする場合：
```bash
# メモリやインスタンス数をカスタマイズ
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions=_MEMORY=1Gi,_MIN_INSTANCES=1,_MAX_INSTANCES=20
```

### 5. 手動デプロイ（代替方法）

Cloud Build を使わずに手動でデプロイする場合：

```bash
# プロジェクトIDを設定
export PROJECT_ID=$(gcloud config get-value project)

# Container Registry にイメージをビルド・プッシュ
docker build -t gcr.io/$PROJECT_ID/my-mastra-agent .
docker push gcr.io/$PROJECT_ID/my-mastra-agent

# Cloud Run にデプロイ（Secret Manager を使用）
gcloud run deploy my-mastra-agent \
  --image gcr.io/$PROJECT_ID/my-mastra-agent \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-secrets="GOOGLE_GENERATIVE_AI_API_KEY=google-generative-ai-api-key:latest"
```

## API エンドポイント

デプロイ後、以下のエンドポイントが利用可能:

### ヘルスチェック
```
GET https://YOUR-SERVICE-URL/
```

### 天気情報取得
```
GET https://YOUR-SERVICE-URL/api/weather?city=Tokyo
```

### 天気とアクティビティ提案
```
POST https://YOUR-SERVICE-URL/api/weather/suggest
Content-Type: application/json

{
  "city": "Tokyo",
  "activity": "running"  // optional
}
```

## ローカルテスト

開発環境では `.env` ファイルを作成：
```bash
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key-here
```

サーバーを起動してテスト：
```bash
# サーバーを起動
bun serve

# API をテスト
curl http://localhost:8080/api/weather?city=Tokyo
```

## トラブルシューティング

### Secret Manager アクセスエラー
Cloud Build サービスアカウントに権限を付与：
```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### メモリ不足エラー
`cloudbuild.yaml` の `_MEMORY` を変更するか、手動デプロイ時に指定：
```bash
gcloud builds submit --config=cloudbuild.yaml --substitutions=_MEMORY=1Gi
```

### ビルドログの確認
```bash
# 最新のビルドログを確認
gcloud builds list --limit=5

# 特定のビルドの詳細ログ
gcloud builds log BUILD_ID
```

### Cloud Run ログの確認
```bash
gcloud run services logs read my-mastra-agent --region asia-northeast1
```
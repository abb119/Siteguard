# Cloud Deployment Guide for SiteGuard

This guide provides instructions for deploying SiteGuard to various cloud platforms.

## Prerequisites

- Docker installed locally
- Cloud provider account (GCP, AWS, or Heroku)
- Docker image built: `docker build -t siteguard-api -f docker/Dockerfile .`

---

## Option 1: Google Cloud Run (Recommended)

**Pros**: Fully managed, auto-scaling, pay-per-use  
**Cost**: Free tier available (~180,000 vCPU-seconds/month)

### Steps:

1. **Install Google Cloud SDK**
   ```bash
   # Follow: https://cloud.google.com/sdk/docs/install
   ```

2. **Authenticate and Set Project**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Build and Push Docker Image to GCR**
   ```bash
   # Tag image for Google Container Registry
   docker tag siteguard-api gcr.io/YOUR_PROJECT_ID/siteguard-api:latest
   
   # Push to GCR
   docker push gcr.io/YOUR_PROJECT_ID/siteguard-api:latest
   ```

4. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy siteguard-api \
     --image gcr.io/YOUR_PROJECT_ID/siteguard-api:latest \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars="DATABASE_URL=YOUR_DB_URL,SLACK_WEBHOOK_URL=YOUR_WEBHOOK"
   ```

5. **Access Your API**
   ```
   Your API will be available at: https://siteguard-api-XXXX-uc.a.run.app
   ```

---

## Option 2: AWS Elastic Container Service (ECS)

**Pros**: Deep AWS integration, stable pricing  
**Cost**: From ~$15/month (t3.micro + ECS Fargate)

### Steps:

1. **Install AWS CLI**
   ```bash
   # Follow: https://aws.amazon.com/cli/
   aws configure
   ```

2. **Create ECR Repository**
   ```bash
   aws ecr create-repository --repository-name siteguard-api
   ```

3. **Push to ECR**
   ```bash
   # Login to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com
   
   # Tag and push
   docker tag siteguard-api:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/siteguard-api:latest
   docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/siteguard-api:latest
   ```

4. **Create ECS Task Definition**
   - Go to AWS ECS Console
   - Create new Task Definition (Fargate)
   - Add container with your ECR image
   - Set environment variables: `DATABASE_URL`, `SLACK_WEBHOOK_URL`

5. **Create ECS Service**
   - Create ECS Cluster
   - Deploy service with your task definition
   - Configure Load Balancer for public access

---

## Option 3: Heroku

**Pros**: Simplest deployment, zero DevOps  
**Cost**: From $7/month (Hobby Dyno)

### Steps:

1. **Install Heroku CLI**
   ```bash
   # Follow: https://devcenter.heroku.com/articles/heroku-cli
   heroku login
   ```

2. **Create Heroku App**
   ```bash
   heroku create siteguard-api
   ```

3. **Add PostgreSQL Addon**
   ```bash
   heroku addons:create heroku-postgresql:essential-0
   ```

4. **Deploy via Container Registry**
   ```bash
   # Login to Heroku Container Registry
   heroku container:login
   
   # Build and push
   heroku container:push web --app siteguard-api
   
   # Release
   heroku container:release web --app siteguard-api
   ```

5. **Set Environment Variables**
   ```bash
   heroku config:set SLACK_WEBHOOK_URL=your_webhook_url --app siteguard-api
   ```

6. **Open Your App**
   ```bash
   heroku open --app siteguard-api
   ```

---

## Environment Variables

All platforms require these environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `SLACK_WEBHOOK_URL` | Slack webhook for alerts | Optional |
| `JWT_SECRET_KEY` | Secret for JWT tokens | Recommended |
| `ROBOFLOW_API_KEY` | For real dataset downloads | Optional |

---

## CI/CD Integration

### GitHub Actions → Cloud Deploy

Add to `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]
    paths-ignore:
      - 'docs/**'
      - '**.md'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Cloud Run
        run: |
          # Cloud Run deployment script
          gcloud run deploy ...
```

---

## Security Best Practices

1. **Never commit secrets** - Use environment variables
2. **Enable HTTPS** - All platforms provide free SSL
3. **Set up JWT authentication** - Protect your API endpoints
4. **Configure CORS** - Restrict allowed origins
5. **Monitor logs** - Set up alerting for errors

---

*For production deployments, consider adding:*
- Redis for caching
- CloudFlare for DDoS protection
- Sentry for error tracking
- DataDog/NewRelic for APM

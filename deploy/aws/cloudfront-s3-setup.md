# Videh Video — S3 + CloudFront

## 1. S3 bucket

- Name: `videh-media-prod` (or your choice)
- Region: `ap-south-1` (Mumbai)
- Block public access: **ON** (CloudFront OAI/OAC only)
- CORS (for direct uploads if added later):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["https://videh.co.in", "https://*.videh.co.in"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 86400
  }
]
```

## 2. CloudFront distribution

- **Origin**: S3 bucket above (Origin Access Control)
- **Default root object**: leave empty
- **Behaviors**:
  - Path `uploads/*` → cache GET/HEAD, forward `Range` header (required for video seeking)
  - TTL: min 0, default 86400, max 31536000
- **Alternate domain**: `cdn.videh.co.in`
- **SSL**: ACM certificate in `us-east-1` for CloudFront

## 3. EC2 IAM role (recommended)

Attach policy to the EC2 instance role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject", "s3:GetObject", "s3:ListBucket", "s3:HeadBucket"],
      "Resource": [
        "arn:aws:s3:::videh-media-prod",
        "arn:aws:s3:::videh-media-prod/*"
      ]
    }
  ]
}
```

## 4. API server `.env`

```env
AWS_S3_BUCKET=videh-media-prod
AWS_REGION=ap-south-1
MEDIA_PUBLIC_BASE_URL=https://cdn.videh.co.in
S3_DELETE_LOCAL_AFTER_UPLOAD=1
```

Videos are stored in DB as `/uploads/reels/...` and uploaded to S3 key `uploads/reels/...`.
CloudFront serves `https://cdn.videh.co.in/uploads/reels/...`.

## 5. Verify

```bash
curl -s https://videh.co.in/api/readyz | jq '.checks.s3, .checks.mediaPublicBase'
```

Upload a test video in the app — playback URL should point to `cdn.videh.co.in`.

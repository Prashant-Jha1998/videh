/**
 * PM2 cluster — uses all CPU cores on EC2 for millions-scale messaging.
 *
 * Env on server (.env):
 *   REDIS_URL=rediss://...          ElastiCache — required for 2+ EC2 instances
 *   PG_POOL_MAX=15                  per worker (workers × PG_POOL_MAX < RDS max_connections)
 *   MEDIA_PUBLIC_BASE_URL=https://cdn.videh.co.in   CloudFront distribution URL
 *   AWS_S3_BUCKET=videh-media-prod                  S3 bucket (origin for CloudFront)
 *   AWS_REGION=ap-south-1                           bucket region
 *   S3_DELETE_LOCAL_AFTER_UPLOAD=1                  free EC2 disk after upload (optional)
 *   API_WORKERS=max                 override instance count (default: all cores)
 */
module.exports = {
  apps: [
    {
      name: "videh-api",
      script: "dist/index.mjs",
      cwd: "/var/www/videh/artifacts/api-server",
      interpreter: "node",
      node_args: "--env-file=/var/www/videh/artifacts/api-server/.env --enable-source-maps",
      instances: process.env.API_WORKERS || "max",
      exec_mode: "cluster",
      max_memory_restart: "1200M",
      listen_timeout: 15000,
      kill_timeout: 8000,
      merge_logs: true,
    },
  ],
};

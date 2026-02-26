#!/bin/bash
# Production Kubernetes Deployment Script for DoAi.Me

set -e

NAMESPACE="doai-me"
IMAGE_REGISTRY="ghcr.io/choichoikule"
IMAGE_NAME="doai-me"
IMAGE_TAG="v1.0.0"
DOMAIN="doai.me"

echo "🚀 Starting production deployment..."

# ─────────────────────────────────────────────────
# 1. Create Namespace
# ─────────────────────────────────────────────────
echo "📦 Creating namespace: $NAMESPACE"
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# ─────────────────────────────────────────────────
# 2. Create ConfigMap
# ─────────────────────────────────────────────────
echo "⚙️  Creating ConfigMap..."
kubectl create configmap doai-me-config \
  --from-literal=NODE_ENV=production \
  --from-literal=SENTRY_ENVIRONMENT=production \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# ─────────────────────────────────────────────────
# 3. Create Secret with environment variables
# ─────────────────────────────────────────────────
echo "🔐 Creating Secret with environment variables..."

# Read from .env.prod.example or use defaults
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://your-project.supabase.co}"
SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-your-anon-key}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-your-service-role-key}"
YOUTUBE_API_KEY="${YOUTUBE_API_KEY:-your-youtube-api-key}"
SENTRY_DSN="${SENTRY_DSN:-}"
SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:-}"

kubectl create secret generic doai-me-secrets \
  --from-literal=NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL" \
  --from-literal=NEXT_PUBLIC_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --from-literal=SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_KEY" \
  --from-literal=YOUTUBE_API_KEY="$YOUTUBE_API_KEY" \
  --from-literal=SENTRY_DSN="$SENTRY_DSN" \
  --from-literal=SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

echo "✅ Secret created!"
echo ""
echo "📝 Next steps:"
echo "1. Update environment variables in Kubernetes Secret:"
echo "   kubectl edit secret doai-me-secrets -n $NAMESPACE"
echo ""
echo "2. Configure DNS (point your domain to Minikube IP):"
echo "   Minikube IP: $(minikube ip)"
echo "   Add to /etc/hosts (or Windows hosts file):"
echo "   $(minikube ip) $DOMAIN www.$DOMAIN"
echo ""
echo "3. Check certificate status:"
echo "   kubectl get certificate -n $NAMESPACE"
echo ""

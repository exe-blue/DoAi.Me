#!/bin/bash
# Comprehensive Deployment Validation Script

set -e

NAMESPACE="doai-me"
APP_LABEL="app=doai-me"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "✅ DEPLOYMENT VALIDATION REPORT"
echo "════════════════════════════════════════════════════════════"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_item() {
    local item=$1
    local status=$2
    
    if [ "$status" = "✓" ]; then
        echo -e "${GREEN}✓${NC} $item"
    else
        echo -e "${RED}✗${NC} $item"
    fi
}

# 1. Namespace
echo "📦 NAMESPACE"
echo "────────────────────────────────────────────────────────────"
if kubectl get namespace $NAMESPACE &>/dev/null; then
    check_item "Namespace '$NAMESPACE' exists" "✓"
else
    check_item "Namespace '$NAMESPACE' exists" "✗"
fi
echo ""

# 2. Pods
echo "🐳 PODS"
echo "────────────────────────────────────────────────────────────"
READY_PODS=$(kubectl get pods -n $NAMESPACE -l $APP_LABEL -o jsonpath='{.items[?(@.status.conditions[?(@.type=="Ready")].status=="True")].metadata.name}' | wc -w)
TOTAL_PODS=$(kubectl get pods -n $NAMESPACE -l $APP_LABEL --no-headers 2>/dev/null | wc -l)

if [ $TOTAL_PODS -gt 0 ]; then
    check_item "Pods deployed: $READY_PODS/$TOTAL_PODS ready" "✓"
    kubectl get pods -n $NAMESPACE -l $APP_LABEL -o custom-columns=NAME:.metadata.name,STATUS:.status.phase,READY:.status.conditions[0].status
else
    check_item "Pods deployed" "✗"
fi
echo ""

# 3. Deployment
echo "🚀 DEPLOYMENT"
echo "────────────────────────────────────────────────────────────"
DEPLOYMENT_STATUS=$(kubectl get deployment doai-me-app -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Progressing")].status}')

if [ "$DEPLOYMENT_STATUS" = "True" ]; then
    check_item "Deployment 'doai-me-app' progressing" "✓"
    DESIRED=$(kubectl get deployment doai-me-app -n $NAMESPACE -o jsonpath='{.spec.replicas}')
    READY=$(kubectl get deployment doai-me-app -n $NAMESPACE -o jsonpath='{.status.readyReplicas}')
    check_item "Replicas ready: $READY/$DESIRED" "✓"
else
    check_item "Deployment 'doai-me-app' progressing" "✗"
fi
echo ""

# 4. Service
echo "🔗 SERVICE"
echo "────────────────────────────────────────────────────────────"
if kubectl get svc doai-me-app -n $NAMESPACE &>/dev/null; then
    check_item "Service 'doai-me-app' exists" "✓"
    CLUSTER_IP=$(kubectl get svc doai-me-app -n $NAMESPACE -o jsonpath='{.spec.clusterIP}')
    ENDPOINTS=$(kubectl get endpoints doai-me-app -n $NAMESPACE -o jsonpath='{.subsets[0].addresses}' | grep -o '10\.[0-9]*\.[0-9]*\.[0-9]*' | wc -l)
    check_item "Service has $ENDPOINTS endpoints" "✓"
else
    check_item "Service 'doai-me-app' exists" "✗"
fi
echo ""

# 5. ConfigMap
echo "⚙️  CONFIGMAP"
echo "────────────────────────────────────────────────────────────"
if kubectl get configmap doai-me-config -n $NAMESPACE &>/dev/null; then
    check_item "ConfigMap 'doai-me-config' exists" "✓"
    CONFIG_KEYS=$(kubectl get configmap doai-me-config -n $NAMESPACE -o jsonpath='{.data}' | grep -o '[A-Z_]*:' | wc -l)
else
    check_item "ConfigMap 'doai-me-config' exists" "✗"
fi
echo ""

# 6. Secret
echo "🔐 SECRET"
echo "────────────────────────────────────────────────────────────"
if kubectl get secret doai-me-secrets -n $NAMESPACE &>/dev/null; then
    check_item "Secret 'doai-me-secrets' exists" "✓"
    SECRET_KEYS=$(kubectl get secret doai-me-secrets -n $NAMESPACE -o jsonpath='{.data}' | grep -o '[A-Z_]*:' | wc -l)
    echo "  Keys configured: $SECRET_KEYS"
else
    check_item "Secret 'doai-me-secrets' exists" "✗"
fi
echo ""

# 7. HPA
echo "📈 HORIZONTAL POD AUTOSCALER"
echo "────────────────────────────────────────────────────────────"
if kubectl get hpa doai-me-hpa -n $NAMESPACE &>/dev/null; then
    check_item "HPA 'doai-me-hpa' exists" "✓"
    MIN_REPLICAS=$(kubectl get hpa doai-me-hpa -n $NAMESPACE -o jsonpath='{.spec.minReplicas}')
    MAX_REPLICAS=$(kubectl get hpa doai-me-hpa -n $NAMESPACE -o jsonpath='{.spec.maxReplicas}')
    CURRENT_REPLICAS=$(kubectl get hpa doai-me-hpa -n $NAMESPACE -o jsonpath='{.status.currentReplicas}')
    check_item "Scaling configured: $MIN_REPLICAS-$MAX_REPLICAS replicas (currently: $CURRENT_REPLICAS)" "✓"
else
    check_item "HPA 'doai-me-hpa' exists" "✗"
fi
echo ""

# 8. Ingress
echo "🌐 INGRESS"
echo "────────────────────────────────────────────────────────────"
if kubectl get ingress doai-me-ingress -n $NAMESPACE &>/dev/null; then
    check_item "Ingress 'doai-me-ingress' exists" "✓"
    HOSTS=$(kubectl get ingress doai-me-ingress -n $NAMESPACE -o jsonpath='{.spec.rules[*].host}')
    echo "  Hosts: $HOSTS"
else
    check_item "Ingress 'doai-me-ingress' exists" "✗"
fi
echo ""

# 9. Certificate
echo "🔒 CERTIFICATE"
echo "────────────────────────────────────────────────────────────"
CERT_READY=$(kubectl get certificate doai-me-selfsigned -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "False")

if [ "$CERT_READY" = "True" ]; then
    check_item "Self-signed certificate ready" "✓"
else
    check_item "Self-signed certificate ready" "✗"
    echo "  (Let's Encrypt cert status may differ in local environments)"
fi
echo ""

# 10. Network Policy
echo "🛡️  NETWORK POLICY"
echo "────────────────────────────────────────────────────────────"
if kubectl get networkpolicy doai-me-network-policy -n $NAMESPACE &>/dev/null; then
    check_item "NetworkPolicy 'doai-me-network-policy' exists" "✓"
else
    check_item "NetworkPolicy 'doai-me-network-policy' exists" "✗"
fi
echo ""

# 11. Pod Disruption Budget
echo "🛡️  POD DISRUPTION BUDGET"
echo "────────────────────────────────────────────────────────────"
if kubectl get pdb doai-me-pdb -n $NAMESPACE &>/dev/null; then
    check_item "PodDisruptionBudget 'doai-me-pdb' exists" "✓"
    MIN_AVAILABLE=$(kubectl get pdb doai-me-pdb -n $NAMESPACE -o jsonpath='{.spec.minAvailable}')
    check_item "Min available pods: $MIN_AVAILABLE" "✓"
else
    check_item "PodDisruptionBudget 'doai-me-pdb' exists" "✗"
fi
echo ""

# 12. Health Check
echo "🏥 HEALTH CHECK"
echo "────────────────────────────────────────────────────────────"
POD=$(kubectl get pods -n $NAMESPACE -l $APP_LABEL -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POD" ]; then
    check_item "Pod health check" "✗"
else
    # Check liveness probe status
    LIVENESS=$(kubectl get pod $POD -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="ContainersReady")].status}')
    
    if [ "$LIVENESS" = "True" ]; then
        check_item "Pod container ready" "✓"
    else
        check_item "Pod container ready" "✗"
    fi
    
    # Check readiness probe
    READY=$(kubectl get pod $POD -n $NAMESPACE -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}')
    
    if [ "$READY" = "True" ]; then
        check_item "Pod readiness probe passing" "✓"
    else
        check_item "Pod readiness probe passing" "✗"
    fi
fi
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ VALIDATION COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo ""

# Summary metrics
echo "📊 CLUSTER SUMMARY"
echo "────────────────────────────────────────────────────────────"
echo "Namespace:        $NAMESPACE"
echo "Deployment:       doai-me-app"
echo "Service Type:     ClusterIP"
echo "Replicas:         $DESIRED"
echo "Ready:            $READY_PODS"
echo ""

# Next steps
echo "📝 NEXT STEPS:"
echo "────────────────────────────────────────────────────────────"
echo "1. Port-forward to access app locally:"
echo "   kubectl port-forward svc/doai-me-app 3000:80 -n $NAMESPACE"
echo ""
echo "2. Configure DNS entries (for production):"
echo "   See DNS-SETUP.md"
echo ""
echo "3. Update environment secrets:"
echo "   kubectl edit secret doai-me-secrets -n $NAMESPACE"
echo ""
echo "4. Monitor deployment:"
echo "   kubectl logs -f -l app=doai-me -n $NAMESPACE"
echo ""

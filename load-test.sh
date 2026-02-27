#!/bin/bash
# Load Testing with ApacheBench for DoAi.Me
# Usage: ./load-test.sh [requests] [concurrency]

REQUESTS=${1:-1000}
CONCURRENCY=${2:-10}
NAMESPACE="doai-me"
POD_NAME=$(kubectl get pods -n $NAMESPACE -l app=doai-me -o jsonpath='{.items[0].metadata.name}')

echo "🚀 Starting Load Test"
echo "════════════════════════════════════════════════════════════"
echo "Requests:    $REQUESTS"
echo "Concurrency: $CONCURRENCY"
echo "Target Pod:  $POD_NAME"
echo ""

# Setup port-forward
echo "📡 Setting up port-forward..."
kubectl port-forward pod/$POD_NAME 3000:3000 -n $NAMESPACE &
PF_PID=$!
sleep 2

# Check if ab (ApacheBench) is available
if ! command -v ab &> /dev/null; then
    echo "⚠️  ApacheBench (ab) not found. Installing..."
    
    if command -v apt-get &> /dev/null; then
        sudo apt-get install -y apache2-utils
    elif command -v brew &> /dev/null; then
        brew install httpd
    else
        echo "❌ Could not install ApacheBench"
        kill $PF_PID
        exit 1
    fi
fi

echo "🧪 Running Load Test..."
echo ""

# Run load test
ab -n $REQUESTS -c $CONCURRENCY -t 30 http://localhost:3000/

# Capture response time stats
echo ""
echo "📊 Additional Metrics:"
echo "════════════════════════════════════════════════════════════"

# Check pod resource usage during test
echo "Pod Resource Usage:"
kubectl top pod $POD_NAME -n $NAMESPACE

# Check HPA scaling
echo ""
echo "HPA Status (Scaling metrics):"
kubectl get hpa -n $NAMESPACE

# Cleanup
echo ""
echo "🧹 Cleaning up..."
kill $PF_PID 2>/dev/null

echo ""
echo "✅ Load test complete!"

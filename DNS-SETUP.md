# DNS Configuration for DoAi.Me Kubernetes Deployment
# 
# Minikube IP: 192.168.49.2
# 
# For local testing, add these entries to your hosts file:

# Windows: C:\Windows\System32\drivers\etc\hosts
# macOS/Linux: /etc/hosts

192.168.49.2 doai.me
192.168.49.2 www.doai.me

# ─────────────────────────────────────────────────
# Windows PowerShell (Run as Administrator):
# ─────────────────────────────────────────────────
# $hostsPath = 'C:\Windows\System32\drivers\etc\hosts'
# $ip = '192.168.49.2'
# $domains = @('doai.me', 'www.doai.me')
# 
# foreach ($domain in $domains) {
#     Add-Content -Path $hostsPath -Value "$ip `t $domain"
# }

# ─────────────────────────────────────────────────
# macOS/Linux (bash):
# ─────────────────────────────────────────────────
# sudo sh -c 'echo "192.168.49.2 doai.me www.doai.me" >> /etc/hosts'

# ─────────────────────────────────────────────────
# Verify DNS resolution:
# ─────────────────────────────────────────────────
# nslookup doai.me
# nslookup www.doai.me


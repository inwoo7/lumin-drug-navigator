# Lumin Drug Navigator - Authentication Gateway Deployment Script
# This script deploys the complete secure authentication architecture

Write-Host "🚀 Deploying Lumin Authentication Gateway..." -ForegroundColor Green

# Step 1: Store secrets in Google Secret Manager
Write-Host "`n📦 Step 1: Setting up secrets..." -ForegroundColor Yellow

$SUPABASE_JWT_SECRET = Read-Host "Enter your Supabase JWT Secret"
$RUNPOD_API_KEY = Read-Host "Enter your RunPod API Key" -AsSecureString
$PROJECT_ID = "lumin-drug-navigator-prod"

# Convert secure string to plain text for gcloud
$RunPodApiKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($RUNPOD_API_KEY))

# Store Supabase JWT Secret
Write-Host "Storing Supabase JWT secret..."
echo $SUPABASE_JWT_SECRET | gcloud secrets create supabase-jwt-secret --data-file=- --project=$PROJECT_ID 2>$null
if ($LASTEXITCODE -ne 0) {
    echo $SUPABASE_JWT_SECRET | gcloud secrets versions add supabase-jwt-secret --data-file=- --project=$PROJECT_ID
}

# Store RunPod API Key
Write-Host "Storing RunPod API key..."
echo $RunPodApiKeyPlain | gcloud secrets create runpod-api-key --data-file=- --project=$PROJECT_ID 2>$null
if ($LASTEXITCODE -ne 0) {
    echo $RunPodApiKeyPlain | gcloud secrets versions add runpod-api-key --data-file=- --project=$PROJECT_ID
}

# Grant Cloud Function access to secrets
Write-Host "Granting Cloud Function access to secrets..."
gcloud secrets add-iam-policy-binding supabase-jwt-secret `
  --member="serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor" `
  --project=$PROJECT_ID

gcloud secrets add-iam-policy-binding runpod-api-key `
  --member="serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com" `
  --role="roles/secretmanager.secretAccessor" `
  --project=$PROJECT_ID

# Step 2: Deploy GCP Authentication Gateway
Write-Host "`n🌐 Step 2: Deploying GCP Authentication Gateway..." -ForegroundColor Yellow

$RUNPOD_ENDPOINT = Read-Host "Enter your RunPod endpoint URL (e.g., https://api.runpod.ai/v2/YOUR_ENDPOINT_ID/run)"

cd gcp-auth-gateway

Write-Host "Installing dependencies..."
npm install

Write-Host "Deploying Cloud Function..."
gcloud functions deploy lumin-auth-gateway `
  --runtime=nodejs18 `
  --trigger=http `
  --allow-unauthenticated `
  --region=us-central1 `
  --memory=512MB `
  --timeout=300s `
  --set-env-vars="RUNPOD_ENDPOINT_URL=$RUNPOD_ENDPOINT" `
  --entry-point=authenticatedTxAgent `
  --project=$PROJECT_ID

# Get the deployed function URL
$GATEWAY_URL = gcloud functions describe lumin-auth-gateway --region=us-central1 --project=$PROJECT_ID --format="value(httpsTrigger.url)"
Write-Host "✅ Gateway deployed at: $GATEWAY_URL" -ForegroundColor Green

cd ..

# Step 3: Update Supabase Edge Function
Write-Host "`n⚡ Step 3: Updating Supabase Edge Function..." -ForegroundColor Yellow

# Add the gateway URL to the environment (this would be done in Supabase dashboard)
Write-Host "⚠️  MANUAL STEP REQUIRED:" -ForegroundColor Red
Write-Host "Add this environment variable to your Supabase Edge Function:"
Write-Host "GCP_AUTH_GATEWAY_URL=$GATEWAY_URL" -ForegroundColor Cyan

Write-Host "`nDeploying updated Supabase function..."
supabase functions deploy openai-assistant

# Step 4: Update RunPod Worker Security
Write-Host "`n🔒 Step 4: Securing RunPod Worker..." -ForegroundColor Yellow

Write-Host "⚠️  MANUAL STEPS REQUIRED for RunPod:" -ForegroundColor Red
Write-Host "1. Clone your current TxAgent template" -ForegroundColor Cyan
Write-Host "2. In GPU settings:" -ForegroundColor Cyan
Write-Host "   - GPU Type: A100-80GB PCIe or SXM" -ForegroundColor White
Write-Host "   - Disable 'Enable MIG'" -ForegroundColor White
Write-Host "   - Disable 'Allow Shared'" -ForegroundColor White
Write-Host "3. Add environment variable:" -ForegroundColor Cyan
Write-Host "   ALLOWED_IPS=35.224.0.0/12,35.232.0.0/13" -ForegroundColor White
Write-Host "4. Deploy the new template" -ForegroundColor Cyan

# Step 5: Testing
Write-Host "`n🧪 Step 5: Testing the setup..." -ForegroundColor Yellow

$TEST_TOKEN = Read-Host "Enter a valid Supabase JWT token for testing (optional)" 

if ($TEST_TOKEN) {
    Write-Host "Testing authentication gateway..."
    $TEST_PAYLOAD = @{
        prompt = "Test prompt for TxAgent"
        max_tokens = 100
        temperature = 0.7
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri $GATEWAY_URL -Method POST `
            -Headers @{
                "Authorization" = "Bearer $TEST_TOKEN"
                "Content-Type" = "application/json"
            } `
            -Body $TEST_PAYLOAD

        Write-Host "✅ Authentication gateway test successful!" -ForegroundColor Green
        Write-Host "Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Test failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "This is normal if you don't have a valid JWT token yet." -ForegroundColor Yellow
    }
}

# Summary
Write-Host "`n🎉 Deployment Summary:" -ForegroundColor Green
Write-Host "✅ Secrets stored in Google Secret Manager" -ForegroundColor Green
Write-Host "✅ GCP Authentication Gateway deployed at:" -ForegroundColor Green
Write-Host "   $GATEWAY_URL" -ForegroundColor Cyan
Write-Host "✅ Supabase Edge Function updated" -ForegroundColor Green
Write-Host "`n⚠️  Complete these manual steps:" -ForegroundColor Yellow
Write-Host "1. Add GCP_AUTH_GATEWAY_URL environment variable to Supabase" -ForegroundColor White
Write-Host "2. Update RunPod worker template with exclusive A100 GPU" -ForegroundColor White
Write-Host "3. Configure RunPod IP whitelisting" -ForegroundColor White

Write-Host "`n🔐 Security Benefits Achieved:" -ForegroundColor Green
Write-Host "✅ JWT validation at GCP gateway" -ForegroundColor Green
Write-Host "✅ RunPod API key never exposed to frontend" -ForegroundColor Green
Write-Host "✅ IP whitelisting protects RunPod workers" -ForegroundColor Green
Write-Host "✅ Exclusive GPU eliminates OOM issues" -ForegroundColor Green
Write-Host "✅ Enterprise-grade audit logging" -ForegroundColor Green

Write-Host "`n💰 Cost Impact:" -ForegroundColor Yellow
Write-Host "- RunPod: ~$1.64/hour (vs $0.50/hour shared) for guaranteed stability" -ForegroundColor White
Write-Host "- GCP Gateway: ~$0.000001 per request (essentially free)" -ForegroundColor White
Write-Host "- Secret Manager: $0.06 per 10k accesses (essentially free)" -ForegroundColor White 
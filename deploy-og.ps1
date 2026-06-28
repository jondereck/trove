Write-Host "Deploying fetch-og..." -ForegroundColor Cyan
npx supabase functions deploy fetch-og
Write-Host "Done. Testing with a Facebook URL..." -ForegroundColor Green

/** Reproducible creator save-flow smoke. No live provider effects. */
import { chromium } from 'playwright';
import { createBuildRecordSkeleton,writeBuildRecord } from '../../../scripts/pathcode-cli/build/record.mjs';
import { startPathBuildSurface } from '../../../scripts/pathcode-cli/build/surface/server.mjs';
import { mkdirSync,writeFileSync,rmSync,mkdtempSync,existsSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { resolvePathPackageRoot } from '../../../scripts/pathcode-cli/paths.mjs';
const packageRoot=resolvePathPackageRoot();
const screenshotRoot=resolve(process.argv[2] || join(tmpdir(),'path-builder-browser-evidence'));mkdirSync(screenshotRoot,{recursive:true});
const root=mkdtempSync(join(tmpdir(),'path-builder-browser-'));
const project=root+'/product';mkdirSync(project,{recursive:true});mkdirSync(project+'/public',{recursive:true});writeFileSync(project+'/public/index.html','<h1>Builder smoke fixture</h1>');
const record=createBuildRecordSkeleton({outcome:'Builder browser acceptance fixture'});record.loop.status='paused';record.projectBindings.push({bindingId:'browser-fixture',projectRoot:project});writeBuildRecord(root,record);
let browser,surface;
try {
 surface=await startPathBuildSurface({packageRoot,runtimeRoot:root,fakeMode:true,autoLoop:false,openBrowser:false,port:0});
 const env=await surface.coordinator.mutateEnvironment(record.buildId,'create_environment',0,{name:'Dedicated build'});
 const stripe=await surface.coordinator.mutateIntegration(record.buildId,{action:'create_integration',expectedIntegrationRevision:0,input:{providerKey:'stripe',label:'Stripe fixture'}});
 await surface.coordinator.mutateIntegration(record.buildId,{action:'bind_environment',expectedIntegrationRevision:1,input:{integrationId:stripe.integrationId,environmentId:env.environmentId}});
 browser=await chromium.launch({...(existsSync('/usr/bin/chromium') ? {executablePath:'/usr/bin/chromium'} : {}),headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(surface.url+'?buildId='+record.buildId);await page.waitForSelector('[data-product-plane="databases"]',{state:'visible'});
 const results=[];
 for(const plane of ['databases','auth','payments','native']) {
  await page.locator(`[data-product-plane="${plane}"]`).click();await page.waitForSelector('#productOperationForm');await page.waitForFunction(()=>document.getElementById('productOperationsStatus').textContent!=='Loading…');
  const form=page.locator('#productOperationForm');
  const titleByPlane={databases:'Browser DB',auth:'Browser sign-in',payments:'Browser checkout',native:'Browser app'};
  if(plane==='databases') await form.locator('[name="label"]').fill(titleByPlane[plane]);
  if(plane==='auth') {await form.locator('[name="label"]').fill(titleByPlane[plane]);await form.locator('[name="baseUrl"]').fill('https://app.example.com');await form.locator('[name="publishableKeyVariableName"]').fill('VITE_SUPABASE_PUBLISHABLE_KEY');}
  if(plane==='payments') {await form.locator('[name="label"]').fill(titleByPlane[plane]);await form.locator('[name="priceIds"]').fill('price_synthetic123');await form.locator('[name="baseUrl"]').fill('https://app.example.com');}
  if(plane==='native') {await form.locator('[name="appName"]').fill(titleByPlane[plane]);await form.locator('[name="appId"]').fill('com.example.browser');}
  await form.getByRole('button',{name:'Add configuration',exact:true}).click();
  await page.getByRole('button',{name:titleByPlane[plane],exact:true}).waitFor();
  await page.getByRole('button',{name:titleByPlane[plane],exact:true}).click();
  if(plane==='databases') {
    await page.locator('[name="projectRef"]').fill('browserproject');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('productOperationsStatus').textContent==='Saved');
    const database=(await surface.coordinator.listDatabases(record.buildId)).items[0];
    if(database.providerTarget.projectRef!=='browserproject')throw new Error('Database target update was not saved');
  }
  results.push({plane,heading:await page.locator('#productOperationsTitle').textContent(),fields:await page.locator('#productOperationForm input,#productOperationForm select').count()});
  await page.screenshot({path:`${screenshotRoot}/browser-${plane}.png`,fullPage:false});
  await page.locator('#closeProductOperations').click();
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#libraryOpen').click();await page.locator('[data-product-plane="native"]').click();await page.waitForSelector('#productOperationForm');await page.screenshot({path:screenshotRoot+'/browser-mobile-width.png'});
 console.log(JSON.stringify({results,errors},null,2));if(errors.length)process.exitCode=1;
} finally {await browser?.close();await surface?.stop({teardownOwned:true});rmSync(root,{recursive:true,force:true});}

import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import {_electron as electron} from '@playwright/test'
const require=createRequire(import.meta.url)
const root=mkdtempSync(join(tmpdir(),'clip-naming-visual-'))
const html=readFileSync('design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html','utf8')
const helper=readFileSync('test-results/naming-field-fixture.js','utf8')
writeFileSync(join(root,'fixture.html'),html)
writeFileSync(join(root,'main.cjs'),`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(root)});app.whenReady().then(()=>{const w=new BrowserWindow({show:false,width:1440,height:900,useContentSize:true,webPreferences:{offscreen:true,backgroundThrottling:false}});w.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));w.loadFile(${JSON.stringify(join(root,'fixture.html'))})});app.on('window-all-closed',()=>app.quit());`)
mkdirSync('test-results/naming-visual',{recursive:true})
const app=await electron.launch({executablePath:require('electron'),args:[join(root,'main.cjs'),'--force-device-scale-factor=1'],env:{...process.env}})
try {
 const page=await app.firstWindow()
 await page.waitForSelector('#exportModal',{state:'attached'})
 await page.evaluate(()=>{const m=document.getElementById('exportModal');m.classList.add('open');m.removeAttribute('inert');m.setAttribute('aria-hidden','false')})
 for(const [width,height] of [[1440,900],[1280,720]]) {
  await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height})
  await page.screenshot({path:`test-results/naming-visual/${width}-before.png`})
  if(!(await page.locator('#exportNamingPattern').count())) {await page.addScriptTag({content:helper});await page.evaluate(()=>NamingFixture.mountExportNamingField(document))}
  await page.locator('#exportNamingPattern').scrollIntoViewIfNeeded()
  await page.screenshot({path:`test-results/naming-visual/${width}-after.png`})
  const bounds=await page.evaluate(()=>{const q=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}};return {width:innerWidth,height:innerHeight,input:q('exportNamingPattern'),save:q('saveExport')}})
  if(bounds.input.x<0||bounds.input.right>bounds.width||bounds.input.bottom>bounds.height||bounds.save.bottom>bounds.height)throw Error('Clipped naming field or footer')
  console.log(JSON.stringify(bounds))
  await page.locator('#exportNamingPattern').fill('{unknown}')
  await page.locator('#exportNamingPattern').dispatchEvent('input')
  await page.screenshot({path:`test-results/naming-visual/${width}-error.png`})
  await page.locator('#exportNamingPattern').fill('clip_{episode}_{candidate}')
  await page.locator('#exportNamingPattern').dispatchEvent('input')
  await page.locator('#exportNamingPattern').evaluate(e=>e.parentElement.remove())
 }
} finally {await app.close();rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:200})}

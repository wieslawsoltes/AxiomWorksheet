"""Chromium integration tests. Set AXIOM_TEST_INLINE=1 for an offline DOM harness.
Normal usage: serve the project, set AXIOM_BASE_URL if needed, then run this file.
The inline harness cannot test native secure-context WebGPU, persistence or downloads.
"""
import base64, json, math, os, shutil, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
INLINE=os.getenv('AXIOM_TEST_INLINE')=='1'
BASE=os.getenv('AXIOM_BASE_URL','http://localhost:8080/')
records=[]

def check(name, condition, details=None):
    if not condition: raise AssertionError(name+': '+str(details))
    records.append({'test':name,'passed':True,'details':details})
    print('PASS',name,flush=True)

with sync_playwright() as p:
    exe=os.getenv('CHROMIUM_PATH') or shutil.which('chromium')
    args=['--no-sandbox']
    if os.getenv('AXIOM_SOFTWARE_GPU')=='1': args.extend(['--enable-unsafe-webgpu','--use-angle=swiftshader'])
    browser=p.chromium.launch(executable_path=exe,headless=os.getenv('AXIOM_HEADED')!='1',args=args)
    context=browser.new_context(viewport={'width':1660,'height':1360},device_scale_factor=1,accept_downloads=True)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    if INLINE: page.set_content((ROOT/'index.html').read_text(),wait_until='load')
    else: page.goto(BASE,wait_until='networkidle')
    page.wait_for_function('window.axiom && !window.axiom.getDiagnostics().calculationStale')
    page.wait_for_timeout(300)
    diag=lambda:page.evaluate('window.axiom.getDiagnostics()')
    value=lambda id:page.evaluate('(id)=>window.axiom.getResults()[id]?.formatted?.magnitude',id)
    doc=lambda:page.evaluate('window.axiom.getDocument()')
    wait=lambda:page.wait_for_function('!window.axiom.getDiagnostics().calculationStale')
    near=lambda a,b:abs(a-b)<1e-7*max(1,abs(b))
    check('Application booted',page.locator('.region').count()==25)
    check('Initial document calculates without errors',diag()['errors']==0)
    check('Beam tip deflection',near(value('tip-deflection'),3.968253968253969))
    check('Native MathML equations present',page.locator('math').count()>=10)

    # Source editing with commit, cancellation and history.
    page.locator('[data-region="length"]').dblclick()
    page.locator('.region-editor').fill('L := 4 m')
    page.locator('.region-editor').press('Enter')
    wait()
    check('Inline edit commits and propagates',near(value('tip-deflection'),3.968253968253969*(4/3)**4))
    page.locator('#undo-button').click();wait()
    check('Undo restores source and dependencies',near(value('tip-deflection'),3.968253968253969))
    page.locator('#redo-button').click();wait()
    check('Redo restores edited calculation',near(value('length'),4))
    page.locator('[data-region="length"]').dblclick()
    page.locator('.region-editor').fill('L := 5 m')
    page.locator('.region-editor').press('Escape');wait()
    check('Escape cancels an edit',near(value('length'),4))

    # Editable unit inspector.
    page.evaluate('window.axiom.select("length")');page.wait_for_timeout(300)
    page.locator('#inspector-body [data-field="outputUnit"]').fill('mm')
    page.locator('#inspector-body [data-field="outputUnit"]').press('Tab');wait()
    check('Inspector converts output units',near(value('length'),4000))
    page.locator('#inspector-body [data-field="outputUnit"]').fill('s')
    page.locator('#inspector-body [data-field="outputUnit"]').press('Tab');wait()
    check('Incompatible unit produces a visible error',page.evaluate('window.axiom.getResults().length.code')=='UNITS')
    page.locator('#undo-button').click();wait()
    check('Undo recovers from a dimensional error',diag()['errors']==0)

    # Pointer drag and resize execute document transactions.
    page.evaluate('window.axiom.select("length")');page.wait_for_timeout(350)
    old=next(r for r in doc()['regions'] if r['id']=='length')
    handle=page.locator('[data-region="length"] .region-drag').bounding_box()
    page.mouse.move(handle['x']+handle['width']/2,handle['y']+handle['height']/2)
    page.mouse.down();page.mouse.move(handle['x']+handle['width']/2+34,handle['y']+handle['height']/2+17,steps=5);page.mouse.up();wait()
    moved=next(r for r in doc()['regions'] if r['id']=='length')
    check('Pointer dragging moves and snaps a region',moved['x']>old['x'] and moved['x']%10==0)
    page.locator('#undo-button').click();wait()
    old=next(r for r in doc()['regions'] if r['id']=='length')
    handle=page.locator('[data-region="length"] .resize-handle').bounding_box()
    page.mouse.move(handle['x']+3,handle['y']+3);page.mouse.down();page.mouse.move(handle['x']+37,handle['y']+20,steps=5);page.mouse.up();wait()
    resized=next(r for r in doc()['regions'] if r['id']=='length')
    check('Pointer resizing changes region dimensions',resized['w']>old['w'])
    page.locator('#undo-button').click();wait()

    # Searchable command palette and matrix dialog.
    page.keyboard.press('Control+k')
    page.locator('#command-input').fill('insert matrix')
    page.locator('#command-input').press('Enter')
    check('Command palette opens matrix editor',page.locator('#modal-title').inner_text()=='Insert a matrix')
    page.locator('#modal-footer .primary-button').click();wait();page.wait_for_timeout(350)
    matrix=doc()['regions'][-1]
    check('Matrix dialog inserts a real evaluated matrix',value(matrix['id'])==[[4,1],[2,3]])
    count=len(doc()['regions'])
    page.locator('#scroll-viewport').focus()
    page.keyboard.press('Control+d');wait()
    check('Duplicate selection',len(doc()['regions'])==count+1)
    page.keyboard.press('Delete');wait()
    check('Delete selection',len(doc()['regions'])==count)
    page.locator('#undo-button').click();wait()
    check('Undo deletion',len(doc()['regions'])==count+1)

    # Export payloads are verified even where native downloads are policy-blocked.
    page.evaluate('''() => {
      window.__exportBlobs=new Map();window.__exports=[];
      const make=URL.createObjectURL.bind(URL);
      URL.createObjectURL=b=>{const url=make(b);window.__exportBlobs.set(url,b);return url;};
      const click=HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click=function(){
        const blob=window.__exportBlobs.get(this.href);
        if(blob){const name=this.download;blob.text().then(text=>window.__exports.push({name,text,type:blob.type}));}
        else click.call(this);
      };
    }''')
    page.locator('[data-action="save"]').first.click();page.wait_for_timeout(150)
    exports=page.evaluate('window.__exports')
    saved=exports[-1]
    check('Save serializes a portable v1 document',saved['name'].endswith('.axw') and json.loads(saved['text'])['format']=='axiom-worksheet')
    saved_doc=json.loads(saved['text'])
    page.evaluate('window.axiom.executeAction("export-html")');page.wait_for_timeout(200)
    exported=page.evaluate('window.__exports.at(-1)')
    check('HTML report contains equations and vector plots','<math' in exported['text'] and '<svg' in exported['text'] and 'class="report"' in exported['text'])
    page.evaluate('window.axiom.executeAction("export-csv")');page.wait_for_timeout(150)
    exported=page.evaluate('window.__exports.at(-1)')
    check('CSV export includes source and results',exported['name'].endswith('.csv') and 'delta_max' in exported['text'])
    page.set_input_files('#open-file',{'name':'roundtrip.axw','mimeType':'application/json','buffer':saved['text'].encode()});wait()
    check('Open round-trips the native document',len(doc()['regions'])==len(saved_doc['regions']))
    page.set_input_files('#csv-file',{'name':'numeric.csv','mimeType':'text/csv','buffer':b'force,length\n1,2\n3,4\n'});page.wait_for_timeout(250);wait()
    imported=doc()['regions'][-1]
    check('Numeric CSV import creates a matrix',value(imported['id'])==[[1,2],[3,4]])

    # Text is inserted as escaped text, never as executable HTML.
    malicious=doc();malicious['regions']=[{'id':'xss-text','type':'text','x':60,'y':70,'w':780,'h':90,'page':0,'text':'<img src=x onerror="window.__xss=1">','style':'body'}];malicious['pages']=1
    page.set_input_files('#open-file',{'name':'escape-test.axw','mimeType':'application/json','buffer':json.dumps(malicious).encode()});page.wait_for_timeout(200);wait()
    check('Imported text cannot inject HTML',page.locator('[data-region="xss-text"] img').count()==0 and page.evaluate('window.__xss') is None)

    # Exercise the second example and real range input events.
    page.locator('.brand').click();page.locator('[data-example="numerical"]').click();wait()
    check('Numerical example evaluates without errors',diag()['errors']==0)
    check('LU solve sample is correct',value('matrix-solution')==[[1.4],[3.4]])
    check('Numerical integration result',near(value('integral'),2))
    check('Symbolic derivative is rendered',page.evaluate('window.axiom.getResults().symbolic.formatted.kind')=='symbolic')
    page.evaluate('window.axiom.select("frequency")');page.wait_for_timeout(500)
    slider=page.locator('[data-region="frequency"] input[type="range"]');slider.focus();slider.press('ArrowRight');wait()
    check('Parameter slider updates its definition',near(value('frequency'),1.1))
    tail=page.evaluate('window.axiom.getResults()["wave-plot"].plot.series[0].points.at(-1)[1]')
    check('Parameter slider updates dependent plot samples',near(tail,math.sin(4*math.pi*1.1)))
    page.evaluate('window.axiom.select("wave-plot")');page.wait_for_timeout(500)
    page.evaluate('window.axiom.executeAction("export-svg")');page.wait_for_timeout(150)
    exported=page.evaluate('window.__exports.at(-1)')
    check('SVG export contains actual curve geometry',exported['name'].endswith('.svg') and 'clipPath' in exported['text'] and '<path' in exported['text'])
    page.wait_for_timeout(7200) # Capture after the export notification expires.
    page.screenshot(path=str(ROOT/'docs'/'numerical-sandbox.png'))

    # Manual mode must never mark stale output as current.
    page.evaluate('window.axiom.executeAction("auto")')
    slider=page.locator('[data-region="frequency"] input[type="range"]');slider.focus();slider.press('ArrowRight');page.wait_for_timeout(250)
    check('Manual mode marks edited results stale',diag()['calculationStale'])
    page.keyboard.press('F9');wait()
    check('F9 explicitly calculates in manual mode',near(value('frequency'),1.2))
    page.evaluate('window.axiom.executeAction("auto")');wait()

    # Grid, zoom, responsive layout and print representation.
    page.evaluate('window.axiom.loadExample("beam")');wait();page.wait_for_timeout(600)
    page.locator('#zoom-slider').fill('85');page.locator('#zoom-slider').dispatch_event('input')
    check('Zoom control updates the view',page.locator('#zoom-value').inner_text()=='85%')
    page.locator('#grid-button').click()
    check('Grid toggle updates view state','active' not in (page.locator('#grid-button').get_attribute('class') or ''))
    page.locator('#grid-button').click()
    page.evaluate('window.axiom.select("load")');page.wait_for_timeout(600)
    page.evaluate('document.querySelector("#scroll-viewport").scrollTop=0')
    page.wait_for_timeout(7200) # Allow notices to expire naturally before taking the screenshot.
    page.screenshot(path=str(ROOT/'docs'/'axiom-worksheet.png'))
    page.emulate_media(media='print')
    check('Print CSS makes vector traces visible',page.locator('.print-trace').first.evaluate('(n)=>getComputedStyle(n).display')!='none')
    page.emulate_media(media='screen')
    page.set_viewport_size({'width':700,'height':900});page.wait_for_timeout(300)
    check('Small-screen layout hides side panels',page.locator('.inspector').evaluate('(n)=>getComputedStyle(n).display')=='none')
    page.screenshot(path=str(ROOT/'docs'/'small-screen.png'))
    check('No uncaught browser JavaScript exceptions',len(errors)==0,errors)
    report={'mode':'offline DOM harness' if INLINE else BASE,'browser':browser.version,'diagnostics':diag(),'tests':records,'uncaughtErrors':errors,'limitations':(['Managed-browser policy prevents navigation, blob workers, native downloads, local storage and secure-context GPU testing. Export content was inspected through an anchor-click harness.'] if INLINE else [])}
    (ROOT/'docs'/'browser-validation.json').write_text(json.dumps(report,indent=2))
    browser.close()
print('Passed',len(records),'browser checks.')

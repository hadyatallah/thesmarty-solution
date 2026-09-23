import {readFileSync,writeFileSync} from 'node:fs';
let runtime=readFileSync('command-center-preview/runtime-prefix.txt','utf8')+readFileSync('command-center/apps-script/CommandCenter.gs','utf8');
runtime+=`\nccLedger_(db_(),true);\nconst endpoints={ccPropose,ccDecide,ccExecute,ccState,ccPrepareBrief};\nreturn {call:async(fn,...args)=>{if(!Object.hasOwn(endpoints,fn))throw Error('Sandbox operation unavailable');return endpoints[fn]('synthetic-session',...args);},changeRecord:()=>{data.records.Tasks[0].version=String(Number(data.records.Tasks[0].version)+1);},data};\n}\n`;
writeFileSync('command-center-preview/runtime.js',runtime);
const modules=[['command-center/crm.js','crm'],['command-center/growth.js','growth'],['command-center/operations.js','operations'],['command-center/prompts.js','prompts'],['command-center/context.js','context'],['command-center/manager.js','manager'],['crm/command-center.js','ui'],['command-center-preview/fixture.js','fixture'],['command-center-preview/runtime.js','runtime'],['command-center-preview/app.js','app']];
const aliases=new Map(modules);let bundle='(()=>{\n';
const {posix:path}=await import('node:path');
for(const [file,name] of modules){let source=readFileSync(file,'utf8');const names=[...source.matchAll(/export (?:async )?(?:const|function|class) (\w+)/g)].map(m=>m[1]);source=source.replace(/import \{([^}]+)\} from '([^']+)';/g,(_,fields,dep)=>{const alias=aliases.get(path.normalize(path.join(path.dirname(file),dep)));if(!alias)throw Error('Unknown dependency '+dep);return `const {${fields}}=${alias};`;}).replace(/export /g,'');bundle+=`const ${name}=(()=>{\n${source}\nreturn {${names.join(',')}};})();\n`;}
bundle+='})();';
const css=readFileSync('crm/index.html','utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const html=readFileSync('command-center-preview/page.html','utf8').replace('/*CRM_STYLE*/',css).replace('/*BUNDLE*/',()=>bundle.replace(/<\/script/gi,'<\\/script'));
writeFileSync('command-center-preview/index.html',html);

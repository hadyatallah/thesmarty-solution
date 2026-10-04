import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync('command-center/taskdates.js','utf8');
const names=[...source.matchAll(/export (?:const|function) (\w+)/g)].map(m=>m[1]);
const output='// Generated from command-center/taskdates.js by scripts/build-task-metrics.mjs.\n(()=>{\n'+source.replace(/\bexport /g,'')+'\nglobalThis.TSSTaskMetrics=Object.freeze({'+names.join(',')+'});\n})();\n';
if(process.argv.includes('--check')){
 if(readFileSync('crm/task-metrics.js','utf8')!==output)throw Error('TASK_METRICS_BUNDLE_OUT_OF_DATE');
}else writeFileSync('crm/task-metrics.js',output);

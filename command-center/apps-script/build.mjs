import {readFileSync,writeFileSync} from 'node:fs';
// Dependency-free packaging of the pure read modules. Each module retains its
// own lexical scope. No Node or network shim is shipped to Apps Script.
const names=['crm','growth','operations'],exportsByModule={};
let out='// Generated from tested read modules. Do not edit.\nvar CCReadCore=(function(){\n';
for(const name of names){
 let src=readFileSync(`command-center/${name}.js`,'utf8');
 const exports=[...src.matchAll(/export (?:const|function|class) (\w+)/g)].map(m=>m[1]);exportsByModule[name]=exports;
 src=src.replace(/import \{([^}]+)\} from '\.\/(\w+)\.js';/g,(_,list,dep)=>`const {${list}}=${dep};`).replace(/export /g,'');
 out+=`const ${name}=(()=>{\n${src}\nreturn {${exports.join(',')}};})();\n`;
}
out+='return {...crm,...growth,...operations};})();\n';
const target=process.argv[2];if(!target)throw Error('Provide the private output path');writeFileSync(target,out+readFileSync('command-center/apps-script/CommandCenter.gs','utf8'));

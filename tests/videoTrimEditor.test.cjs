/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS TSX harness. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const refs=[];
let pauses=0, plays=0, range, ready;
const fakeVideo={currentTime:0,duration:10,pause(){pauses++;},async play(){plays++;}};
const hooks={...React,useEffect(){},useRef(value){const ref={current:refs.length===0?fakeVideo:value};refs.push(ref);return ref;},useState(value){return [value,()=>{}];}};
const code=ts.transpileModule(fs.readFileSync('components/content/VideoTrimEditor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',code)(name=>name==='react'?hooks:name.endsWith('.css')?{default:{}}:require(name),mod,mod.exports);
const tree=mod.exports.default({file:{},duration:10,start:2,end:8,disabled:false,onReady:d=>ready=d,onRangeChange:(a,b)=>range=[a,b]});
function nodes(node){return !node||typeof node!=='object'?[]:[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const all=nodes(tree),video=all.find(n=>n.type==='video');
(async()=>{
video.props.onLoadedMetadata({currentTarget:fakeVideo});assert.equal(ready,10);
const start=all.find(n=>n.props?.['aria-label']==='切り取り開始位置');
start.props.onChange({target:{value:'3.2'}});assert.deepEqual(range,[3.2,8]);assert.equal(fakeVideo.currentTime,3.2);
const end=all.find(n=>n.props?.['aria-label']==='切り取り終了位置');
end.props.onChange({target:{value:'7.5'}});assert.deepEqual(range,[2,7.5]);assert.equal(fakeVideo.currentTime,7.5);
const button=label=>all.find(n=>n.type==='button'&&n.props.children===label);
await button('選択範囲を再生').props.onClick();assert.equal(fakeVideo.currentTime,2);assert.equal(plays,1);
fakeVideo.currentTime=8.2;video.props.onTimeUpdate({currentTarget:fakeVideo});assert.equal(fakeVideo.currentTime,8);assert.ok(pauses>0);
button('範囲をリセット').props.onClick();assert.deepEqual(range,[0,10]);assert.equal(fakeVideo.currentTime,0);
console.log('Video trim editor: metadata, range updates and seeking, selection playback/end stop, reset passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});

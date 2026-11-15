import test from 'node:test';
import assert from 'node:assert/strict';
import {NOTE_HEADERS,NotesStore,noteParts,filterNotes} from '../notes.js';
test('links preserve text and restrict clickable protocols',()=>{
 const text='Zie (www.example.org) en https://example.com/a?q=1. javascript:alert(1)';
 const parts=noteParts(text);assert.equal(parts.map(p=>p.text).join(''),text);
 assert.deepEqual(parts.filter(p=>p.url).map(p=>p.url),['https://www.example.org/','https://example.com/a?q=1']);
});
test('notes search title and content within selected status',()=>{
 const notes=[{title:'Kanji',body:'https://example.org',status:'actief',updatedAt:'b'},{title:'Kanji',body:'oud',status:'gearchiveerd',updatedAt:'a'}];
 assert.equal(filterNotes(notes,'actief','KANJI').length,1);assert.equal(filterNotes(notes,'actief','example.org').length,1);
});
test('notes retry, edit, archive, restore and delete preserve IDs and use only notes sheet',async()=>{
 const rows=[NOTE_HEADERS];const calls=[];
 const store=new NotesStore({async request(path,options){calls.push(path);assert.ok(decodeURIComponent(path).includes("'Studienotities'!"));if(!options)return {values:rows};const values=JSON.parse(options.body).values;if(options.method==='POST')rows.push(...values);else {const row=Number(decodeURIComponent(path).match(/!A(\d+):F/)[1]);rows[row-1]=values[0];}return {}; }},()=> 'now');
 const note={id:'one',title:'Link',body:'https://example.org'};await store.create(note);await store.create(note);assert.equal(rows.length,2);
 await store.update({...note,body:'=Literal text'});assert.equal(rows[1][2],'=Literal text');assert.equal(rows[1][4],'now');
 for(const status of ['gearchiveerd','actief','verwijderd']){await store.setStatus('one',status);assert.equal(rows[1][3],status);}
 await assert.rejects(()=>store.update(note),/verwijderd/);await assert.rejects(()=>store.create({...note,id:'two',body:''}));
});

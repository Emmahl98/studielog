import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreSession,saveSession,clearSession} from '../auth-session.js';
function memory(){const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
test('valid session survives page reload, and logout clears it',()=>{
  const storage=memory();const session={clientId:'app',token:'fake-test-token',expiresAt:2000};
  saveSession(storage,session);assert.deepEqual(restoreSession(storage,'app',1000),session);
  clearSession(storage);assert.equal(restoreSession(storage,'app',1000),null);
});
test('expired sessions and sessions from another client are not reused',()=>{
  for(const [clientId,now] of [['app',2000],['other',1000]]){
    const storage=memory();saveSession(storage,{clientId:'app',token:'fake-test-token',expiresAt:2000});
    assert.equal(restoreSession(storage,clientId,now),null);
    assert.equal(restoreSession(storage,'app',1000),null);
  }
});
test('disabled browser storage does not break sign-in',()=>{
  const storage={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');},removeItem(){throw Error('disabled');}};
  assert.equal(restoreSession(storage,'app'),null);assert.doesNotThrow(()=>saveSession(storage,{}));assert.doesNotThrow(()=>clearSession(storage));
});

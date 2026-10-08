import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeltaCursor} from '../server/outlook/_core.js';

const base='https://graph.microsoft.com/v1.0/me/mailFolders/';
const token='?$deltatoken=opaque';

test('accepts slash-form well-known folder cursor',()=> {
 assert.equal(validateDeltaCursor(base+'inbox/messages/delta'+token,'inbox').startsWith(base),true);
});
test('accepts OData parenthesis form for well-known folder',()=> {
 assert.doesNotThrow(()=>validateDeltaCursor(`https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages/delta${token}`,'inbox'));
});
test('accepts opaque folder id only with provider-verified folder id',()=> {
 const id='AAMk-folder-id';
 const cursor=`https://graph.microsoft.com/v1.0/me/mailFolders('${id}')/messages/delta${token}`;
 assert.doesNotThrow(()=>validateDeltaCursor(cursor,'inbox',{folderId:id}));
 assert.throws(()=>validateDeltaCursor(cursor,'sentitems',{folderId:'OTHER-FOLDER-ID'}),/OUTLOOK_CURSOR_RESET_REQUIRED/);
});
test('rejects wrong folder, malformed, encoded traversal and non-Graph origins',()=> {
 assert.throws(()=>validateDeltaCursor(base+'sentitems/messages/delta'+token,'inbox'),/OUTLOOK_CURSOR_RESET_REQUIRED/);
 assert.throws(()=>validateDeltaCursor('https://graph.microsoft.com/v1.0/me/mailFolders/%2E%2E/messages/delta'+token,'inbox'),/OUTLOOK_CURSOR_RESET_REQUIRED/);
 assert.throws(()=>validateDeltaCursor('https://evil.example/v1.0/me/mailFolders/inbox/messages/delta'+token,'inbox'),/OUTLOOK_CURSOR_RESET_REQUIRED/);
});

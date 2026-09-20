'use strict';
const {dispatch}=require('../../api/studio-chat');
exports.handler=async(event)=>dispatch({method:event.httpMethod,headers:Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v])),body:event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body||'',ip:event.headers?.['x-nf-client-connection-ip']||'unknown'});

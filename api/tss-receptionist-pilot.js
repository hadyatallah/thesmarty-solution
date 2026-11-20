import {get,put,BlobPreconditionFailedError} from "@vercel/blob";
import {getVercelOidcToken} from "@vercel/oidc";
import {waitUntil} from "@vercel/functions";
import WebSocket from "ws";
import {createCloseSupervisor} from "../lib/tss-voice-pilot/close-session.mjs";
import {createPublicPilot} from "../lib/tss-voice-pilot/runtime.mjs";
const handler=createPublicPilot({getEnv:()=>process.env,blobGet:get,blobPut:put,
  preconditionError:BlobPreconditionFailedError,loadOidcToken:()=>getVercelOidcToken(),
  prepareClose:createCloseSupervisor({Socket:WebSocket,waitUntil})});
export default {fetch:handler};

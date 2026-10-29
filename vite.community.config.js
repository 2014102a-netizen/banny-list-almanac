import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config.js';
export default mergeConfig(base,defineConfig({plugins:[{name:'isolated-api',configureServer(server){server.middlewares.use('/config.js',(_req,res)=>{res.setHeader('Content-Type','application/javascript');res.end('window.ALMANAC_API="http://127.0.0.1:4174/api";');});}}]}));

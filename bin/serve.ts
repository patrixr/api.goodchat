#!/usr/bin/env node

// --> dotenv preload <--
require('kankyo').inject({ verbose: true }); // eslint-disable-line

import goodchat             from '..'
import http                 from 'http'
import logger               from '../lib/utils/logger'
import { promisify }        from 'util'
import { read }             from '../lib/utils/env'
import {
  GoodChatAuthConfig,
  GoodChatAuthMode
} from '../lib/typings/goodchat';
import { setupWebhooks }    from '../lib/routes/webhooks/setup';

const port  = read.number('PORT', 8000);
const env   = read('NODE_ENV', 'development')
const dev   = /development/.test(env);

const { info, panic } = logger('server');

// -------------------------
// Helpers
// -------------------------

async function resolveHost() : Promise<string> {
  if (!dev) {
    return read.strict('GOODCHAT_HOST');
  }

  const ngrok = await import('ngrok');

  info('firing up ngrok'); 

  return ngrok.connect({
    proto: 'http',
    addr:   port
  });
}

function authConfig() : GoodChatAuthConfig {
  if (read.bool('NO_AUTH')) { return { mode: GoodChatAuthMode.NONE } }
  
  return {
    mode: GoodChatAuthMode.WEBHOOK,
    url:  read.string.strict('GOODCHAT_AUTH_URL')
  }
}

// -------------------------
// Slightly less dramatic exit
// -------------------------

process.on('uncaughtException', panic);
process.on('SIGTERM', panic);

// -------------------------
// Startup
// -------------------------

(async function() {
  try {
    info(`${env} environment detected`);

    const host = await resolveHost();

    const config = {
      goodchatHost:           host,
      smoochAppId:            read.strict('SMOOCH_APP_ID'),
      smoochApiKeyId:         read.strict('SMOOCH_API_KEY_ID'),
      smoochApiKeySecret:     read.strict('SMOOCH_API_KEY_SECRET'),
      auth:                   authConfig()
    }

    const [app, apollo] = await goodchat(config)
    
    const server = http.createServer(app.callback());

    apollo.installSubscriptionHandlers(server)

    const boot = promisify(server.listen.bind(server)) as (port: string|number) => Promise<void>
    
    await boot(port)

    info(`goodchat host: ${host}`);
    info(`goodchat port: ${port}`);

    if (dev) {
      setupWebhooks(config)
    }

  } catch (e) {
    panic(e)
  }
})();


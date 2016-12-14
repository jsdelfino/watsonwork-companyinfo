// A sample app that listens to messages posted to a space in IBM Watson
// Workspace and automatically retrieves information about companies
// mentioned in the messages

import express from 'express';
import * as request from 'request';
import * as util from 'util';
import * as bparser from 'body-parser';
import { createHmac } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import * as oauth from './oauth';
import * as ssl from './ssl';
import debug from 'debug';

// Debug log
const log = debug('watsonwork-companyinfo-app');

// Look for company entities mentioned in messages and automatically retrieve
// and post information about these companies
export const companyInfo = (appId, token) => (req, res) => {
  // Respond to the Webhook right away, as the response message will
  // be sent asynchronously
  res.status(201).end();

  // Only handle message-created Webhook events, and ignore the app's
  // own messages
  if(req.body.type !== 'message-created' || req.body.userId === appId)
    return;

  log('Got a message %o', req.body);

  // React to mentions of company names in the message and send company
  // information back to the conversation in the originating space
  if(req.body.content
    // Tokenize the message text into individual words
    .split(/[^A-Za-z0-9]+/)
    // Look for a mention of a company name
    .filter((word) => /^(Acme)$/i.test(word)).length)

    // Send the company info message
    send(req.body.spaceId,
      'Acme',
      util.format('The Acme company'),
      token(),
      (err, res) => {
        if(!err)
          log('Sent message to space %s', req.body.spaceId);
      });
};

// Send an app message to the conversation in a space
const send = (spaceId, title, text, tok, cb) => {
  request.post(
    'https://api.watsonwork.ibm.com/v1/spaces/' + spaceId + '/messages', {
      headers: {
        Authorization: 'Bearer ' + tok
      },
      json: true,
      // An App message can specify a color, a title, markdown text and
      // an 'actor' useful to show where the message is coming from
      body: {
        type: 'appMessage',
        version: 1.0,
        annotations: [{
          type: 'generic',
          version: 1.0,

          color: '#6CB7FB',
          title: title,
          text: text,

          actor: {
            name: 'from sample companyinfo app',
            avatar: 'https://avatars1.githubusercontent.com/u/22985179',
            url: 'https://github.com/jsdelfino/watsonwork-companyinfo'
          }
        }]
      }
    }, (err, res) => {
      if(err || res.statusCode !== 201) {
        log('Error sending message %o', err || res.statusCode);
        cb(err || new Error(res.statusCode));
        return;
      }
      log('Send result %d, %o', res.statusCode, res.body);
      cb(null, res.body);
    });
};

// Verify Watson Work request signature
export const verify = (wsecret) => (req, res, buf, encoding) => {
  if(req.get('X-OUTBOUND-TOKEN') !==
    createHmac('sha256', wsecret).update(buf).digest('hex')) {
    log('Invalid request signature');
    const err = new Error('Invalid request signature');
    err.status = 401;
    throw err;
  }
};

// Handle Watson Work Webhook challenge requests
export const challenge = (wsecret) => (req, res, next) => {
  if(req.body.type === 'verification') {
    log('Got Webhook verification challenge %o', req.body);
    const body = JSON.stringify({
      response: req.body.challenge
    });
    res.set('X-OUTBOUND-TOKEN',
      createHmac('sha256', wsecret).update(body).digest('hex'));
    res.type('json').send(body);
    return;
  }
  next();
};

// Create Express Web app
export const webapp = (appId, secret, wsecret, cb) => {
  // Authenticate the app and get an OAuth token
  oauth.run(appId, secret, (err, token) => {
    if(err) {
      cb(err);
      return;
    }

    // Return the Express Web app
    cb(null, express()

      // Configure Express route for the app Webhook
      .post('/companyinfo',

        // Verify Watson Work request signature and parse request body
        bparser.json({
          type: '*/*',
          verify: verify(wsecret)
        }),

        // Handle Watson Work Webhook challenge requests
        challenge(wsecret),

        // Handle Watson Work messages
        companyInfo(appId, token)));
  });
};

// App main entry point
const main = (argv, env, cb) => {
  // Create Express Web app
  webapp(
    env.COMPANYINFO_APP_ID, env.COMPANYINFO_APP_SECRET,
    env.COMPANYINFO_WEBHOOK_SECRET, (err, app) => {
      if(err) {
        cb(err);
        return;
      }

      if(env.PORT) {
        // In a hosting environment like Bluemix for example, HTTPS is
        // handled by a reverse proxy in front of the app, just listen
        // on the configured HTTP port
        log('HTTP server listening on port %d', env.PORT);
        http.createServer(app).listen(env.PORT, cb);
      }

      else
        // Listen on the configured HTTPS port, default to 443
        ssl.conf(env, (err, conf) => {
          if(err) {
            cb(err);
            return;
          }
          const port = env.SSLPORT || 443;
          log('HTTPS server listening on port %d', port);
          https.createServer(conf, app).listen(port, cb);
        });
    });
};

if (require.main === module)
  main(process.argv, process.env, (err) => {
    if(err) {
      console.log('Error starting app:', err);
      return;
    }
    log('App started');
  });


// A sample app that listens to messages posted to a space in IBM Watson
// Workspace and automatically retrieves information about companies
// mentioned in the messages

// Test the happy path

import { expect } from 'chai';
import * as jsonwebtoken from 'jsonwebtoken';
import * as util from 'util';
import * as request from 'request';

// Rudimentary mock of the request module
let postspy;
let getspy;
require.cache[require.resolve('request')].exports = {
  post: (uri, opt, cb) => postspy(uri, opt, cb),
  get: (uri, opt, cb) => getspy(uri, opt, cb)
};

// Configure test entity recognition and metadata URLs
process.env.COMPANYINFO_FR_METADATA_URL = 'https://test/entity/%s/metadata';
process.env.COMPANYINFO_FR_ER_URL = 'https://test/entity/recognition';

// Load the Company Info app
const companyInfo = require('../app');

// Generate a test OAuth token
const token = jsonwebtoken.sign({}, 'secret', { expiresIn: '1h' });

describe('watsonwork-companyinfo', () => {

  // Mock the Watson Work OAuth service
  const oauth = (uri, opt, cb) => {
    expect(opt.auth).to.deep.equal({
      user: 'testappid',
      pass: 'testsecret'
    });
    expect(opt.json).to.equal(true);
    expect(opt.form).to.deep.equal({
      grant_type: 'client_credentials'
    });

    // Return OAuth token
    setImmediate(() => cb(undefined, {
      statusCode: 200,
      body: {
        access_token: token
      }
    }));
  };

  it('authenticates the app', (done) => {

    // Check async callbacks
    let checks = 0;
    const check = () => {
      if(++checks === 2)
        done();
    };

    postspy = (uri, opt, cb) => {
      // Expect a call to get an OAuth token for the app
      if(uri === 'https://api.watsonwork.ibm.com/oauth/token') {
        oauth(uri, opt, cb);
        check();
        return;
      }
    };

    // Create the Company Info Web app
    companyInfo.webapp('testappid', 'testsecret', 'testwsecret',
      'testfruserid', 'testfrkey', (err, app) => {
        expect(err).to.equal(null);
        check();
      });
  });

  it('handles Webhook challenge requests', (done) => {

    // Check async callbacks
    let checks = 0;
    const check = () => {
      if(++checks === 2)
        done();
    };

    postspy = (uri, opt, cb) => {
      // Expect a call to get an OAuth token for the app
      if(uri === 'https://api.watsonwork.ibm.com/oauth/token') {
        oauth(uri, opt, cb);
        check();
        return;
      }
    };

    // Create the Company Info Web app
    companyInfo.webapp('testappid', 'testsecret', 'testwsecret',
      'testfruserid', 'testfrkey', (err, app) => {
        expect(err).to.equal(null);

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Post a Webhook challenge request to the app
        request.post(
          'http://localhost:' + server.address().port + '/companyinfo', {
            headers: {
              // Signature of the test body with the Webhook secret
              'X-OUTBOUND-TOKEN':
                'f51ff5c91e99c63b6fde9e396bb6ea' +
                '3023727f74f1853f29ab571cfdaaba4c03'
            },
            json: true,
            body: {
              type: 'verification',
              challenge: 'testchallenge'
            }
          }, (err, res) => {
            expect(err).to.equal(null);
            expect(res.statusCode).to.equal(200);

            // Expect correct challenge response and signature
            expect(res.body.response).to.equal('testchallenge');
            expect(res.headers['x-outbound-token']).to.equal(
              // Signature of the test body with the Webhook secret
              '876d1f9de1b36514d30bcf48d8c4' +
              '731a69500730854a964e31764159d75b88f1');

            check();
          });
      });
  });

  it('posts company information messages back', (done) => {

    // Check async callbacks
    let checks = 0;
    const check = () => {
      if(++checks === 5)
        done();
    };

    postspy = (uri, opt, cb) => {
      // Expect a call to get the OAuth token of an app
      if(uri === 'https://api.watsonwork.ibm.com/oauth/token') {
        oauth(uri, opt, cb);
        check();
        return;
      }

      // Expect a call to recognize company entities
      if(uri === process.env.COMPANYINFO_FR_ER_URL) {
        setImmediate(() => cb(undefined, {
          statusCode: 200,
          // Return company entity
          body: {
            result: {
              entity: [{
                searchToken: 'C:AcmeCompany',
                relevanceScore: 100
              }]
            }
          }
        }));
        check();
      }

      // Expect a call to send company info message to the test space
      if(uri ===
        'https://api.watsonwork.ibm.com/v1/spaces/testspace/messages') {
        expect(opt.headers).to.deep.equal({
          Authorization: 'Bearer ' + token
        });
        expect(opt.json).to.equal(true);
        expect(opt.body).to.deep.equal({
          type: 'appMessage',
          version: 1.0,
          annotations: [{
            type: 'generic',
            version: 1.0,

            color: '#6CB7FB',
            text: '*Company*\nThe Acme company\n*' +
              'Industries*\nTest industry\n' +
              '*Sectors*\nTest sector\n' +
              '*Segments*\nTest segment\n'
          }]
        });
        setImmediate(() => cb(undefined, {
          statusCode: 201,
          // Return list of spaces
          body: {
          }
        }));
        check();
      }
    };

    getspy = (uri, opt, cb) => {
      // Expect a call to get company information
      if(uri === util.format(process.env.COMPANYINFO_FR_METADATA_URL,
        'C:AcmeCompany')) {
        // Return company information
        setImmediate(() => cb(undefined, {
          statusCode: 200,
          body: {
            result: {
              name: 'The Acme company',
              data: {
                entityMap: {
                  language: [],
                  industry: [{ name: 'Test industry' }],
                  sector: [{ name: 'Test sector' }],
                  segment: [{ name: 'Test segment' }]
                }
              }
            }
          }
        }));
        check();
        return;
      }
    };

    // Create the Company Info Web app
    companyInfo.webapp('testappid', 'testsecret', 'testwsecret',
      'testfruserid', 'testfrkey', (err, app) => {
        expect(err).to.equal(null);

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Post a chat message to the app
        request.post(
          'http://localhost:' + server.address().port + '/companyinfo', {
            headers: {
              'X-OUTBOUND-TOKEN':
                // Signature of the body with the Webhook secret
                '885d8a05999b704443eae5576439e0aa' +
                '13eb19a10f197c5a5bf7226f22313ad9'
            },
            json: true,
            body: {
              type: 'message-created',
              content: 'I\'m meeting with folks at Acme tomorrow',
              userName: 'Jane',
              spaceId: 'testspace'
            }
          }, (err, val) => {
            expect(err).to.equal(null);
            expect(val.statusCode).to.equal(201);

            check();
          });
      });
  });

  it('rejects messages with invalid signature', (done) => {

    // Check async callbacks
    let checks = 0;
    const check = () => {
      if(++checks === 2)
        done();
    };

    postspy = (uri, opt, cb) => {
      // Expect a call to get an OAuth token for the app
      if(uri === 'https://api.watsonwork.ibm.com/oauth/token') {
        oauth(uri, opt, cb);
        check();
        return;
      }
    };

    // Create the Company Info Web app
    companyInfo.webapp('testappid', 'testsecret', 'testwsecret',
      'testfruserid', 'testfrkey', (err, app) => {
        expect(err).to.equal(null);

        // Listen on an ephemeral port
        const server = app.listen(0);

        // Post a chat message to the app
        request.post(
          'http://localhost:' + server.address().port + '/companyinfo', {
            headers: {
              'X-OUTBOUND-TOKEN':
                // Test an invalid body signature
                'invalidsignature'
            },
            json: true,
            body: {
              type: 'message-created',
              content: 'I\'m meeting with folks at Acme tomorrow',
              userName: 'Jane',
              spaceId: 'testspace'
            }
          }, (err, val) => {
            expect(err).to.equal(null);

            // Expect the request to be rejected
            expect(val.statusCode).to.equal(401);

            check();
          });
      });
  });
});


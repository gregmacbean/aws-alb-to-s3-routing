#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RouterStack } from '../lib/router-stack';

const app = new cdk.App();

const accountId = process.env.ACCOUNT_ID;
const region = process.env.AWS_REGION;
const domainName = process.env.DOMAIN_NAME;

if (!accountId || !region || !domainName) {
  console.error(
    'Please set ACCOUNT_ID, AWS_REGION, and DOMAIN_NAME environment variables.'
  );
  process.exit(1);
}

new RouterStack(app, 'RouterStack', {
  env: { account: accountId, region },
  domainName,
});

app.synth();

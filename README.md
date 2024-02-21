# AWS ALB to S3 routing using S3 Interface endpoint

This CDK stack sets up an AWS infrastructure to route traffic from an Application Load Balancer (ALB) to an Amazon S3 bucket. It is useful for scenarios where you want to serve private static website content from S3 via an internal domain.

## Prerequisites

- Node.js (>= 10.3.0)
- TypeScript
- AWS CLI installed and configured with necessary credentials
- AWS CDK installed globally (`npm install -g aws-cdk`)

## Installation

1. Clone this repository.
2. Install dependencies: `npm install`
3. Bootstrap the CDK environment: `cdk bootstrap`
4. Export environment variables, replacing them with your account specific details:

```bash
export ACCOUNT_ID=your-account-id
export DOMAIN_NAME=your-domain-name
export AWS_REGION=your-preferred-region
```

5. Deploy the stack: `cdk deploy`

## Usage

After deploying the stack, you will have an ALB configured to route traffic to the specified S3 bucket based on the domain name provided. You can upload your static website files to the S3 bucket, and they will be served through the ALB with the custom domain.

## Configuration

The stack can be configured by passing parameters when deploying. The `domainName` parameter is required to set up the custom domain for the S3 bucket.

## Stack Details

The stack consists of the following components:

- **VPC**: Default VPC is used for networking resources.
- **S3 VPC Endpoint**: Allows private communication between the ALB and the S3 bucket.
- **S3 Bucket**: Stores the static website files.
- **Bucket Policy**: Configures access policies for the S3 bucket to allow access only from the specified VPC Endpoint.
- **ALB**: Application Load Balancer to route traffic based on the domain name.
- **Target Group**: Specifies the IP targets for the ALB to forward traffic to the S3 bucket.
- **Security Group**: Controls the traffic to and from the ALB.

## Cleanup

To remove the stack and its associated resources: `cdk destroy`

## References

* https://blog.mckie.info/aws-gateway-vpc-endpoint-s3-with-cdk
* https://medium.com/aws-specialists/how-to-host-an-internal-website-with-aws-alb-s3-and-privatelink-9f8448d112f4

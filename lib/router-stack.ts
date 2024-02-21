import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { IpTarget } from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import { AnyPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CnameRecord, HostedZone, IHostedZone } from 'aws-cdk-lib/aws-route53';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

interface RouterStackProps extends StackProps {
  domainName: string;
}

export class RouterStack extends Stack {
  constructor(scope: Construct, id: string, props: RouterStackProps) {
    super(scope, id, props);

    const { domainName } = props;
    const fqdn = `site1.${domainName}`;

    const vpc = this.setupVpc();

    const s3VpcEndpoint = this.createS3VpcEndpoint(vpc);

    const networkInterfaceProps = this.getNetworkInterfaceProps(
      s3VpcEndpoint.vpcEndpointId
    );

    const s3EndpointIpAddresses = this.getS3EndpointIpAddresses(
      networkInterfaceProps
    );

    const bucket = this.createBucket(fqdn);

    this.deployWebsite(bucket);

    this.configureBucketPolicy(bucket, s3VpcEndpoint);

    const s3EndpointTargetGroup = this.createS3EndpointTargetGroup(
      vpc,
      s3EndpointIpAddresses
    );

    const alb = this.createApplicationLoadBalancer(vpc);

    const hostedZone = this.getHostedZone(domainName);
    this.configureHostedZoneRecordSet(hostedZone, alb);

    this.setupLoadBalancerListeners(alb, s3EndpointTargetGroup, fqdn);
  }
  configureHostedZoneRecordSet(
    hostedZone: IHostedZone,
    alb: elbv2.ApplicationLoadBalancer
  ) {
    new CnameRecord(this, 'AlbAliasRecord', {
      zone: hostedZone,
      recordName: 'site1',
      domainName: alb.loadBalancerDnsName,
    });
  }

  private getHostedZone(domainName: string) {
    return HostedZone.fromLookup(this, 'ExistingHostedZone', {
      domainName: domainName,
    });
  }

  private setupVpc(): ec2.IVpc {
    return ec2.Vpc.fromLookup(this, 'ImportVPC', {
      isDefault: true,
    });
  }

  private createS3VpcEndpoint(vpc: ec2.IVpc): ec2.InterfaceVpcEndpoint {
    return new ec2.InterfaceVpcEndpoint(this, 'S3 VPC Endpoint', {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(
        `com.amazonaws.${this.region}.s3`,
        80
      ),
    });
  }

  private getNetworkInterfaceProps(vpcEndpointId: string): AwsCustomResource {
    const vpcEndpointProps = new AwsCustomResource(this, `vpcEndpointProps`, {
      onUpdate: {
        service: 'EC2',
        action: 'describeVpcEndpoints',
        parameters: {
          VpcEndpointIds: [vpcEndpointId],
        },
        physicalResourceId: {},
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    return new AwsCustomResource(this, `networkInterfaceProps`, {
      onUpdate: {
        service: 'EC2',
        action: 'describeNetworkInterfaces',
        parameters: {
          NetworkInterfaceIds: [
            vpcEndpointProps.getResponseField(
              'VpcEndpoints.0.NetworkInterfaceIds.0'
            ),
            vpcEndpointProps.getResponseField(
              'VpcEndpoints.0.NetworkInterfaceIds.1'
            ),
          ],
        },
        physicalResourceId: {},
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });
  }

  private getS3EndpointIpAddresses(
    networkInterfaceProps: AwsCustomResource
  ): string[] {
    return [
      networkInterfaceProps.getResponseField(
        'NetworkInterfaces.0.PrivateIpAddress'
      ),
      networkInterfaceProps.getResponseField(
        'NetworkInterfaces.1.PrivateIpAddress'
      ),
    ];
  }

  private createBucket(domainName: string): s3.IBucket {
    return new s3.Bucket(this, 'SiteBucket', {
      websiteIndexDocument: 'index.html',
      bucketName: domainName,
      publicReadAccess: false,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
  }

  private deployWebsite(bucket: s3.IBucket): void {
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('./site')],
      destinationBucket: bucket,
    });
  }

  private configureBucketPolicy(
    bucket: s3.IBucket,
    vpcEndpoint: ec2.InterfaceVpcEndpoint
  ): void {
    const allowAccessToS3 = new PolicyStatement({
      actions: ['s3:*'],
      effect: Effect.ALLOW,
      principals: [new AnyPrincipal()],
      resources: [bucket.arnForObjects('*')],
      conditions: {
        StringEquals: {
          'aws:sourceVpce': vpcEndpoint.vpcEndpointId,
        },
      },
    });
    bucket.addToResourcePolicy(allowAccessToS3);
  }

  private createS3EndpointTargetGroup(
    vpc: ec2.IVpc,
    ipAddresses: string[]
  ): elbv2.ApplicationTargetGroup {
    const ipTargets = ipAddresses.map((ip) => new IpTarget(ip));

    return new elbv2.ApplicationTargetGroup(this, 's3EndpointGroup', {
      targetGroupName: 'S3Endpoints',
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: {
        protocol: elbv2.Protocol.HTTP,
        path: '/',
        interval: Duration.minutes(5),
        healthyHttpCodes: '200,307,405',
      },
      targetType: elbv2.TargetType.IP,
      targets: ipTargets,
      vpc,
    });
  }

  private createApplicationLoadBalancer(
    vpc: ec2.IVpc
  ): elbv2.ApplicationLoadBalancer {
    const albSg = new ec2.SecurityGroup(this, 'AlbSg', {
      vpc,
      allowAllOutbound: true,
    });

    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80));

    return new elbv2.ApplicationLoadBalancer(this, 'MyAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSg,
    });
  }

  private setupLoadBalancerListeners(
    alb: elbv2.ApplicationLoadBalancer,
    targetGroup: elbv2.ApplicationTargetGroup,
    domainName: string
  ): void {
    const httpListener = alb.addListener('http', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not Found',
      }),
    });

    httpListener.addAction('s3', {
      action: elbv2.ListenerAction.forward([targetGroup]),
      conditions: [elbv2.ListenerCondition.hostHeaders([domainName])],
      priority: 1,
    });
  }
}

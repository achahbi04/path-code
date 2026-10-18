/** Public product operation contracts. Browser projections intentionally differ. */
export interface AuthConfig {
  siteUrlSource: 'p11_domain' | 'explicit'; domainId: string | null; siteUrl: string; redirectUrls: string[];
  signupEnabled: boolean; emailEnabled: boolean; emailConfirmationRequired: boolean;
  publishableKeyVariableName: string;
  socialProviders: Array<{provider:'google'|'github';enabled:boolean;clientId:string;clientSecretRef:string|null}>;
}
export interface AuthObservation {
  state:'unverified'|'ready'|'action_required'|'unavailable';adapterVersion:string|null;projectRef:string|null;
  configDigest:string|null;siteUrl:string|null;redirectUrlsDigest:string|null;enabledMethods:string[];
  observedAt:string|null;failureCode:string|null;matchesDesired:boolean|null;
}
export interface BuildAuthItem {authId:string;provider:'supabase';label:string;databaseId:string;environmentId:string;config:AuthConfig;observation:AuthObservation;createdAt:string;updatedAt:string}
export interface AuthOperation {operationId:string;authId:string;state:'prepared'|'effect_started'|'completed'|'uncertain'|'failed_no_effect'|'interrupted';authRevision:number;databaseRevision:number;environmentRevision:number;domainRevision:number;desiredDigest:string;observedDigest:string;createdAt:string;updatedAt:string;failureCode:string|null}
export interface BuildAuthAuthority {schema:'pathcode.p14.auth.v1';revision:number;items:BuildAuthItem[];pendingOperation:AuthOperation|null;operationHistory:AuthOperation[]}
export interface PaymentConfig {
  label:string;integrationId:string;verificationBindingId:string;runtimeEnvironmentId:string;expectedMode:'test'|'live';
  checkout:{mode:'payment'|'subscription';priceIds:string[];successPath:string;cancelPath:string;webhookPath:string;requiredWebhookEvents:string[]};
  urlSource:{kind:'p11_domain'|'explicit';domainId:string|null;explicitBaseUrl:string|null};dependencies:{authId:string|null;databaseId:string|null};
  webhook:{endpointId:string|null;signingSecretVariableName:'STRIPE_WEBHOOK_SECRET'};
}
export interface BuildPaymentItem extends PaymentConfig {paymentId:string;provider:'stripe';createdAt:string;updatedAt:string}
export interface BuildPaymentAuthority {schema:'pathcode.p15.payments.v1';revision:number;items:BuildPaymentItem[]}
export interface NativeProfileConfig {appId:string;appName:string;platforms:Array<'ios'|'android'>;buildEnvironmentId:string;packagePolicy:{capacitorVersion:'8.5.3';webDir:string;iosPackageManager:'SPM'};authId:string|null;authCallbackScheme:string|null}
export interface BuildNativeProfile extends NativeProfileConfig {nativeId:string;createdAt:string;updatedAt:string}
export interface NativeOperation {operationId:string;nativeId:string;state:'prepared'|'running'|'completed'|'failed'|'interrupted'|'stale';sourceSha:string;sourceTreeSha:string;profileDigest:string;environmentRevision:number;nativeRevision:number;workspaceId:string;framework:'static'|'vite'|'astro'|'next';packageManager:'npm'|'pnpm'|'yarn'|'bun'|null;installCommand:string[]|null;buildCommand:string[]|null;capacitorVersion:'8.5.3';createdAt:string;updatedAt:string;failureCode:string|null}
export interface NativeArtifact {artifactId:string;nativeId:string;sourceSha:string;sourceTreeSha:string;platforms:Array<'ios'|'android'>;checksums:Array<{path:string;sha256:string}>;bytes:number;state:'packaged'|'stale';createdAt:string}
export interface BuildNativeAuthority {schema:'pathcode.p16.native.v1';revision:number;profiles:BuildNativeProfile[];pendingOperation:NativeOperation|null;operationHistory:NativeOperation[];artifacts:NativeArtifact[]}
export type OperationFailure={ok:false;code:string};

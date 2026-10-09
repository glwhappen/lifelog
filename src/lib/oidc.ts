import { env } from './env';

/** OIDC 端点发现（Authentik / 任何标准 IdP 均可） */
export interface OidcEndpoints {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
}

let cached: OidcEndpoints | null = null;

export async function oidcEndpoints(): Promise<OidcEndpoints> {
  if (cached) return cached;
  if (!env.oidcIssuer) throw new Error('OIDC_ISSUER 未配置');
  const base = env.oidcIssuer.endsWith('/') ? env.oidcIssuer : `${env.oidcIssuer}/`;
  const res = await fetch(`${base}.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`OIDC discovery 失败: ${res.status}`);
  const data: any = await res.json();
  cached = {
    authorization_endpoint: data.authorization_endpoint,
    token_endpoint: data.token_endpoint,
    userinfo_endpoint: data.userinfo_endpoint,
    end_session_endpoint: data.end_session_endpoint,
  };
  return cached;
}

/** 反代之后按转发头构造对外 URL（NextResponse.redirect 需要绝对地址） */
export function externalOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

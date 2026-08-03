import{C as e,I as t,M as n,N as r,P as i,T as a,a as o,b as s,c,d as l,i as u,k as d,l as f,n as p,r as m,w as h}from"./utils-C998F5Ty.js";import{o as g}from"./dist-BMR3FRaJ.js";import{t as _}from"./readChangesetState-B7K4vGsO.js";import v from"path";import{Buffer as y}from"node:buffer";import{randomUUID as b}from"node:crypto";import x from"node:fs/promises";import S from"node:path";import C from"node:os";const w=async(e,t)=>(await e.graphql(`
  query getRepositoryMetadata(
    $owner: String!
    $repo: String!
    $baseRef: String!
    $targetRef: String!
  ) {
    repository(owner: $owner, name: $repo) {
      id
      baseRef: ref(qualifiedName: $baseRef) {
        id
        target {
          oid
          ... on Tag {
            target {
              oid
            }
          }
        }
      }
      targetBranch: ref(qualifiedName: $targetRef) {
        id
        target {
          oid
        }
      }
    }
  }
`,t)).repository,T=async(e,t)=>e.graphql(`
  mutation createCommitOnBranch($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
      }
      ref {
        id
      }
    }
  }
`,t);function E(e){if(typeof e==`object`)return{headline:e.headline.trim(),body:e.body?.trim()};if(!e.includes(`
`))return{headline:e.trim()};let[t,...n]=e.split(`
`);return{headline:t.trim(),body:n.join(`
`).trim()}}function D(e){return`branch`in e?`refs/heads/${e.branch}`:`tag`in e?`refs/tags/${e.tag}`:e.commit}async function O({octokit:e,owner:t,repo:n,branch:r,base:i,force:a=!1,message:o,fileChanges:s}){let c=D(i),l=await w(e,{owner:t,repo:n,baseRef:c,targetRef:`refs/heads/${r}`});if(!l)throw Error(`Repository "${t}/${n}" not found`);let u=`commit`in i?i.commit:k(l.baseRef);if(!u)throw Error(`Could not determine sha for base ref "${c}"`);let d=l.targetBranch?.target?.oid??null,f=async(t,n)=>{let r=await T(e,{input:{branch:{id:t},expectedHeadOid:u,message:E(o),fileChanges:s}});if(r.createCommitOnBranch?.ref?.id==null)throw Error(`Failed to create commit on branch "${n}"`);if(r.createCommitOnBranch?.commit?.oid==null)throw Error(`Failed to determine commit sha for commit on branch "${n}"`);return{commitSha:r.createCommitOnBranch.commit.oid}};if(d==null){let i=(await e.rest.git.createRef({owner:t,repo:n,ref:`refs/heads/${r}`,sha:u})).data.node_id;if(!i)throw Error(`Failed to create branch "${r}"`);return await f(i,r),{refId:i}}else if(d===u){let e=l.targetBranch.id;return await f(e,r),{refId:e}}else if(a){let i=`changesets-ghcommit-temp/${r}`;try{let{tempRefId:a}=await A({octokit:e,owner:t,repo:n,tempBranch:i,baseSha:u}),{commitSha:o}=await f(a,i),s=(await e.rest.git.updateRef({owner:t,repo:n,ref:`heads/${r}`,sha:o,force:!0})).data.node_id;if(!s)throw Error(`Failed to force update branch "${r}"`);return{refId:s}}finally{await e.rest.git.deleteRef({owner:t,repo:n,ref:`heads/${i}`})}}else throw Error(`Branch "${r}" exists but its HEAD does not match the base ${u} and \`force\` is set to false`)}function k(e){return e?.target?`target`in e.target?e.target.target.oid:e.target.oid:null}async function A({octokit:e,owner:t,repo:n,tempBranch:r,baseSha:i}){try{let a=(await e.rest.git.createRef({owner:t,repo:n,ref:`refs/heads/${r}`,sha:i})).data.node_id;if(!a)throw Error(`Failed to create temporary branch "${r}"`);return{tempRefId:a}}catch(a){if(!j(a))throw a;let o=(await e.rest.git.updateRef({owner:t,repo:n,ref:`heads/${r}`,sha:i,force:!0})).data.node_id;if(!o)throw Error(`Failed to force update temporary branch "${r}"`);return{tempRefId:o}}}function j(e){return typeof e==`object`&&!!e&&`status`in e&&`message`in e&&typeof e.status==`number`&&typeof e.message==`string`&&e.status===422&&e.message.includes(`Reference already exists`)}async function M({cwd:e,filterFiles:t,...n}){e=v.resolve(e??process.cwd());let r=D(n.base??{commit:`HEAD`}),i=await P(e,r);if(!i)throw Error(`Could not determine sha for ref ${r}`);return await O({...n,fileChanges:await N(e,i,t),base:{commit:i}})}async function N(e,t,n){let r=await F(e),i=[],a=[],o=async e=>{if(n&&!n(e))return;let t=v.join(r,e),a=await x.lstat(t);if(a.isSymbolicLink())throw Error(`Unexpected symlink at ${e}, GitHub API only supports files and directories. You may need to add this file to .gitignore`);if(a.mode&73)throw Error(`Unexpected executable file at ${e}, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore`);i.push({path:e,contents:await x.readFile(t,`base64`)})},s=e=>{n&&!n(e)||a.push({path:e})},[c,l]=await Promise.all([g(`git`,[`diff`,`--name-status`,`--diff-filter=ACDMRT`,t],{throwOnError:!0,nodeOptions:{cwd:r}}),g(`git`,[`ls-files`,`--others`,`--exclude-standard`],{throwOnError:!0,nodeOptions:{cwd:r}})]);for(let e of c.stdout.trim().split(`
`)){if(!e)continue;let[t,...n]=e.split(`	`);if(t.startsWith(`R`)||t.startsWith(`C`)){let[e,t]=n;s(e),await o(t);continue}let r=n[0];t===`D`?s(r):await o(r)}for(let e of l.stdout.trim().split(`
`))e&&await o(e);return i.sort((e,t)=>e.path>t.path?1:-1),a.sort((e,t)=>e.path>t.path?1:-1),{additions:i,deletions:a}}async function P(e,t){try{let{stdout:n}=await g(`git`,[`rev-parse`,t],{throwOnError:!0,nodeOptions:{cwd:e}});return n.trim()}catch{return null}}async function F(e){try{let{stdout:t}=await g(`git`,[`rev-parse`,`--git-dir`],{throwOnError:!0,nodeOptions:{cwd:e}});return v.dirname(v.resolve(e,t.trim()))}catch{return e}}var ee=t(e(),1),te=`0.0.0-development`,I=()=>Promise.resolve();function L(e,t,n){return e.retryLimiter.schedule(R,e,t,n)}async function R(e,t,n){let{pathname:r}=new URL(n.url,`http://github.test`),i=z(n.method,r),a=!i&&n.method!==`GET`&&n.method!==`HEAD`,o=n.method===`GET`&&r.startsWith(`/search/`),s=r.startsWith(`/graphql`),c=~~t.retryCount>0?{priority:0,weight:0}:{};e.clustering&&(c.expiration=1e3*60),(a||s)&&await e.write.key(e.id).schedule(c,I),a&&e.triggersNotification(r)&&await e.notifications.key(e.id).schedule(c,I),o&&await e.search.key(e.id).schedule(c,I);let l=(i?e.auth:e.global).key(e.id).schedule(c,t,n);if(s){let e=await l;if(e.data.errors!=null&&e.data.errors.some(e=>e.type===`RATE_LIMITED`))throw Object.assign(Error(`GraphQL Rate Limit Exceeded`),{response:e,data:e.data})}return l}function z(e,t){return e===`PATCH`&&/^\/applications\/[^/]+\/token\/scoped$/.test(t)||e===`POST`&&(/^\/applications\/[^/]+\/token$/.test(t)||/^\/app\/installations\/[^/]+\/access_tokens$/.test(t)||t===`/login/oauth/access_token`)}var B=[`/orgs/{org}/invitations`,`/orgs/{org}/invitations/{invitation_id}`,`/orgs/{org}/teams/{team_slug}/discussions`,`/orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments`,`/repos/{owner}/{repo}/collaborators/{username}`,`/repos/{owner}/{repo}/commits/{commit_sha}/comments`,`/repos/{owner}/{repo}/issues`,`/repos/{owner}/{repo}/issues/{issue_number}/comments`,`/repos/{owner}/{repo}/issues/{issue_number}/sub_issue`,`/repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority`,`/repos/{owner}/{repo}/pulls`,`/repos/{owner}/{repo}/pulls/{pull_number}/comments`,`/repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`,`/repos/{owner}/{repo}/pulls/{pull_number}/merge`,`/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`,`/repos/{owner}/{repo}/pulls/{pull_number}/reviews`,`/repos/{owner}/{repo}/releases`,`/teams/{team_id}/discussions`,`/teams/{team_id}/discussions/{discussion_number}/comments`];function V(e){let t=`^(?:${e.map(e=>e.split(`/`).map(e=>e.startsWith(`{`)?`(?:.+?)`:e).join(`/`)).map(e=>`(?:${e})`).join(`|`)})[^/]*$`;return new RegExp(t,`i`)}var H=V(B),U=H.test.bind(H),W={},G=function(e,t){W.global=new e.Group({id:`octokit-global`,maxConcurrent:10,...t}),W.auth=new e.Group({id:`octokit-auth`,maxConcurrent:1,...t}),W.search=new e.Group({id:`octokit-search`,maxConcurrent:1,minTime:2e3,...t}),W.write=new e.Group({id:`octokit-write`,maxConcurrent:1,minTime:1e3,...t}),W.notifications=new e.Group({id:`octokit-notifications`,maxConcurrent:1,minTime:3e3,...t})};function K(e,t){let{enabled:n=!0,Bottleneck:r=ee.default,id:i=`no-id`,timeout:a=1e3*60*2,connection:o}=t.throttle||{};if(!n)return{};let s={timeout:a};o!==void 0&&(s.connection=o),W.global??G(r,s);let c=Object.assign({clustering:o!=null,triggersNotification:U,fallbackSecondaryRateRetryAfter:60,retryAfterBaseValue:1e3,retryLimiter:new r,id:i,...W},t.throttle);if(typeof c.onSecondaryRateLimit!=`function`||typeof c.onRateLimit!=`function`)throw Error(`octokit/plugin-throttling error:
        You must pass the onSecondaryRateLimit and onRateLimit error handlers.
        See https://octokit.github.io/rest.js/#throttling

        const octokit = new Octokit({
          throttle: {
            onSecondaryRateLimit: (retryAfter, options) => {/* ... */},
            onRateLimit: (retryAfter, options) => {/* ... */}
          }
        })
    `);let l={},u=new r.Events(l);return l.on(`secondary-limit`,c.onSecondaryRateLimit),l.on(`rate-limit`,c.onRateLimit),l.on(`error`,t=>e.log.warn(`Error in throttling-plugin limit handler`,t)),c.retryLimiter.on(`failed`,async function(t,n){let[r,i,a]=n.args,{pathname:o}=new URL(a.url,`http://github.test`);if(!(o.startsWith(`/graphql`)&&t.status!==401||t.status===403||t.status===429))return;let s=~~i.retryCount;i.retryCount=s,a.request.retryCount=s;let{wantRetry:c,retryAfter:l=0}=await(async function(){if(/\bsecondary rate\b/i.test(t.message)){let n=Number(t.response.headers[`retry-after`])||r.fallbackSecondaryRateRetryAfter;return{wantRetry:await u.trigger(`secondary-limit`,n,a,e,s),retryAfter:n}}if(t.response.headers!=null&&t.response.headers[`x-ratelimit-remaining`]===`0`||(t.response.data?.errors??[]).some(e=>e.type===`RATE_LIMITED`)){let n=new Date(~~t.response.headers[`x-ratelimit-reset`]*1e3).getTime(),r=Math.max(Math.ceil((n-Date.now())/1e3)+1,0);return{wantRetry:await u.trigger(`rate-limit`,r,a,e,s),retryAfter:r}}return{}})();if(c)return i.retryCount++,l*r.retryAfterBaseValue}),e.hook.wrap(`request`,L.bind(null,c)),{}}K.VERSION=te,K.triggersNotification=U;const q=e=>a(e,{throttle:{onRateLimit:(e,t,r,i)=>{if(n(`Request quota exhausted for request ${t.method} ${t.url}`),i<=2)return d(`Retrying after ${e} seconds!`),!0},onSecondaryRateLimit:(e,t,r,i)=>{if(n(`SecondaryRateLimit detected for request ${t.method} ${t.url}`),i<=2)return d(`Retrying after ${e} seconds!`),!0}}},K),J=async(e,t)=>{await r(`git`,[`push`,`origin`,`HEAD:${e}`,`--force`],t)},Y=async(e,t)=>{let{stderr:n}=await i(`git`,[`checkout`,e],{ignoreReturnCode:!0,...t});n.toString().includes(`Switched to a new branch '${e}'`)||await r(`git`,[`checkout`,`-b`,e],t)},X=async(e,t)=>{await r(`git`,[`reset`,`--hard`,e],t)},Z=async(e,t)=>{await r(`git`,[`add`,`.`],t),await r(`git`,[`commit`,`-m`,e],t)},ne=async e=>{let{stdout:t}=await i(`git`,[`status`,`--porcelain`],e);return!t.length};function re(e){try{let t=new URL(e);return t.protocol!==`http:`&&t.protocol!==`https:`?void 0:(t.password=``,t.search=``,t.hash=``,t.href)}catch{return}}var ie=class{#e;octokit;cwd;pushWithGitCli;serverUrl;constructor(e){this.#e=e.githubToken,this.cwd=e.cwd,this.pushWithGitCli=e.pushWithGitCli??!1,this.serverUrl=(e.serverUrl??h.serverUrl??process.env.GITHUB_SERVER_URL??`https://github.com`).replace(/\/+$/,``),this.octokit=q(e.githubToken)}getToken(){return this.#e}async#t(){let e=y.from(`x-access-token:${this.#e}`).toString(`base64`),t=Number(process.env.GIT_CONFIG_COUNT??0);if(!Number.isInteger(t)||t<0)throw Error(`Invalid GIT_CONFIG_COUNT value: ${process.env.GIT_CONFIG_COUNT}`);let{stdout:n}=await i(`git`,[`remote`,`get-url`,`--push`,`--all`,`origin`],{cwd:this.cwd,ignoreReturnCode:!0,silent:!0}),r=new Set([`http.${this.serverUrl}/.extraheader`]);for(let e of n.split(/\r?\n/)){let t=re(e);t!==void 0&&r.add(`http.${t}.extraheader`)}let a=`AUTHORIZATION: basic ${e}`,o={GIT_CONFIG_COUNT:String(t+r.size*2)},s=0;for(let e of r){let n=t+s*2,r=n+1;o[`GIT_CONFIG_KEY_${n}`]=e,o[`GIT_CONFIG_VALUE_${n}`]=``,o[`GIT_CONFIG_KEY_${r}`]=e,o[`GIT_CONFIG_VALUE_${r}`]=a,s++}return o}async ensureGitUser(){let e=await i(`git`,[`-c`,`user.useConfigOnly=true`,`var`,`GIT_AUTHOR_IDENT`],{cwd:this.cwd,ignoreReturnCode:!0,silent:!0}),t=await i(`git`,[`-c`,`user.useConfigOnly=true`,`var`,`GIT_COMMITTER_IDENT`],{cwd:this.cwd,ignoreReturnCode:!0,silent:!0});e.exitCode===0&&t.exitCode===0||(d(`Setting Git user to github-actions[bot]`),await r(`git`,[`config`,`user.name`,`"github-actions[bot]"`],{cwd:this.cwd}),await r(`git`,[`config`,`user.email`,`"41898282+github-actions[bot]@users.noreply.github.com"`],{cwd:this.cwd}))}async pushTag(e){if(!this.pushWithGitCli)return this.octokit.rest.git.createRef({...h.repo,ref:`refs/tags/${e}`,sha:h.sha}).catch(t=>{n(`Failed to create tag ${e}: ${t.message}`)});await r(`git`,[`push`,`origin`,e],{cwd:this.cwd,env:{...process.env,...await this.#t()}})}async prepareBranch(e){this.pushWithGitCli&&(await Y(e,{cwd:this.cwd}),await X(h.sha,{cwd:this.cwd}))}async pushChanges({branch:e,message:t}){if(!this.pushWithGitCli){await M({octokit:this.octokit,...h.repo,branch:e,message:t,base:{commit:h.sha},force:!0,cwd:this.cwd});return}await ne({cwd:this.cwd})||(await this.ensureGitUser(),await Z(t,{cwd:this.cwd})),await J(e,{cwd:this.cwd,env:{...process.env,...await this.#t()}})}};const ae=async(e,{pkg:t,tagName:n})=>{let r;try{r=await x.readFile(S.join(t.dir,`CHANGELOG.md`),`utf8`)}catch(e){if(f(e,`ENOENT`))return;throw e}let i=u(r,t.packageJson.version);if(!i)throw Error(`Could not find changelog entry for ${t.packageJson.name}@${t.packageJson.version}`);await e.rest.repos.createRelease({name:n,tag_name:n,body:i.content,prerelease:t.packageJson.version.includes(`-`),...h.repo})};var Q=class extends Error{};function oe(e){return typeof e==`object`&&!!e}function $(e){return oe(e)&&`type`in e&&e.type===`git-tag`&&`tag`in e&&typeof e.tag==`string`&&`packageName`in e&&typeof e.packageName==`string`}async function se(e){let t;try{t=await x.readFile(e,`utf8`)}catch(t){throw new Q(`Failed to read changesets output at ${e}`,{cause:t})}let n=[],r=0;for(;r<=t.length;){let e=t.indexOf(`
`,r);e===-1&&(e=t.length);let i=t.slice(r,e);if(r=e+1,/^\s*$/.test(i))continue;let a;try{a=JSON.parse(i)}catch(e){throw Error(`Failed to parse changesets output event: ${i}`,{cause:e})}$(a)&&n.push(a)}return n}async function ce({script:e,fromPackDir:t,github:r,createGithubReleases:a,pushGitTags:c,cwd:l}){let{octokit:u}=r;await r.ensureGitUser();let d,f=S.join(process.env.RUNNER_TEMP??await x.realpath(C.tmpdir()),`changesets-output-${b()}.ndjson`),p={cwd:l,ignoreReturnCode:!0,env:{...process.env,GITHUB_TOKEN:r.getToken(),CHANGESETS_OUTPUT:f}};if(e)d=await i(e,void 0,p);else{let e=[`publish`];t&&e.push(`--from-pack-dir`,t),d=await o(e,p)}let{packages:m,tool:h}=await s(l),g=new Map(m.map(e=>[e.packageJson.name,e])),_;try{_=await se(f)}catch(t){if(!e||!(t instanceof Q))throw t;n(`${t.message}. GitHub releases and git tags cannot be created without this output. Ensure the custom publish script passes CHANGESETS_OUTPUT to the Changesets CLI.`),_=[]}let v=_.map(e=>{let t=g.get(e.packageName);if(t===void 0)throw Error(`Package "${e.packageName}" not found.This is probably a bug in the action, please open an issue`);return{pkg:t,tag:e.tag}});if(h.type===`root`&&m.length===0)throw Error(`No package found.This is probably a bug in the action, please open an issue`);return(a||c)&&await Promise.all(v.map(async({pkg:e,tag:t})=>{c&&await r.pushTag(t),a&&await ae(u,{pkg:e,tagName:t})})),v.length?{published:!0,publishedPackages:v.map(({pkg:e})=>({name:e.packageJson.name,version:e.packageJson.version})),exitCode:d.exitCode}:{published:!1,exitCode:d.exitCode}}async function le({hasPublishScript:e,preState:t,changedPackagesInfo:n,prBodyMaxCharacters:r,branch:i}){let a=`This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${e?`the packages will be published to npm automatically`:`publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`}. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${i}, this PR will be updated.
`,o=t?`⚠️⚠️⚠️⚠️⚠️⚠️

\`${i}\` is currently in **pre mode** so this branch has prereleases rather than normal releases. If you want to exit prereleases, run \`changeset pre exit\` on \`${i}\`.

⚠️⚠️⚠️⚠️⚠️⚠️
`:``,s=`# Releases`,c=[a,o,s,...n.map(e=>`${e.header}\n\n${e.content}`)].join(`
`);return c.length>r&&(c=[a,o,s,`
> The changelog information of each package has been omitted from this message, as the content exceeds the size limit.
`,...n.map(e=>`${e.header}\n\n`)].join(`
`)),c.length>r&&(c=[a,o,s,`
> All release information have been omitted from this message, as the content exceeds the size limit.`].join(`
`)),c}async function ue({script:e,github:t,cwd:n=process.cwd(),prTitle:i=`Version Packages`,commitMessage:a=`Version Packages`,hasPublishScript:o=!1,prBodyMaxCharacters:s=6e4,branch:f=h.ref.replace(`refs/heads/`,``),prDraft:g}){let{octokit:v}=t,y=`changeset-release/${f}`,{preState:b}=await _(n);await t.prepareBranch(y);let C=await c(n),w={...process.env,GITHUB_TOKEN:t.getToken()};e?await r(e,void 0,{cwd:n,env:w}):await p([`version`],{cwd:n,env:w});let T=await m(n,C),E=Promise.all(T.map(async e=>{let t=u(await x.readFile(S.join(e.dir,`CHANGELOG.md`),`utf8`),e.packageJson.version);return{highestLevel:t.highestLevel,private:!!e.packageJson.private,content:t.content,header:`## ${e.packageJson.name}@${e.packageJson.version}`}})),D=`${i}${b?` (${b.tag})`:``}`,O=`${a}${b?` (${b.tag})`:``}`,k=await v.rest.pulls.list({...h.repo,state:`open`,head:`${h.repo.owner}:${y}`,base:f});d(`Existing pull requests: ${JSON.stringify(k.data,null,2)}`),await t.pushChanges({branch:y,message:O});let A=await le({hasPublishScript:o,preState:b,branch:f,changedPackagesInfo:(await E).filter(e=>e).sort(l),prBodyMaxCharacters:s});if(k.data.length===0){d(`creating pull request`);let{data:e}=await v.rest.pulls.create({base:f,head:y,title:D,body:A,draft:g!==void 0,...h.repo});return{pullRequestNumber:e.number}}else{let[e]=k.data;d(`updating found pull request #${e.number}`);let t=`
      mutation UpdatePullRequest(
        $pullRequestId: ID!
        $title: String!
        $body: String!
      ) {
        ${g===`always`?`
        convertPullRequestToDraft(
          input: {
            pullRequestId: $pullRequestId
          }
        ) {
          pullRequest {
            id
          }
        }`:``}

        updatePullRequest(
          input: {
            pullRequestId: $pullRequestId
            title: $title
            body: $body
            state: OPEN
          }
        ) {
          pullRequest {
            id
          }
        }
      }
    `;return await v.graphql(t,{pullRequestId:e.node_id,title:D,body:A}),{pullRequestNumber:e.number}}}export{ue as n,ie as r,ce as t};
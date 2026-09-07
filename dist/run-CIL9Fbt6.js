import{C as e,E as t,I as n,M as r,N as i,P as a,T as o,a as s,b as c,c as l,d as u,i as d,k as f,l as p,n as m,r as h,w as g}from"./utils-j_VOz275.js";import{o as _}from"./dist-BjZhuI7Y.js";import{t as v}from"./readChangesetState-DLdyz-Wv.js";import y from"path";import{Buffer as b}from"node:buffer";import{randomUUID as x}from"node:crypto";import S from"node:fs/promises";import C from"node:path";import w from"node:os";const T=async(e,t)=>(await e.graphql(`
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
`,t)).repository,E=async(e,t)=>e.graphql(`
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
`,t);function D(e){if(typeof e==`object`)return{headline:e.headline.trim(),body:e.body?.trim()};if(!e.includes(`
`))return{headline:e.trim()};let[t,...n]=e.split(`
`);return{headline:t.trim(),body:n.join(`
`).trim()}}function O(e){return`branch`in e?`refs/heads/${e.branch}`:`tag`in e?`refs/tags/${e.tag}`:e.commit}async function k({octokit:e,owner:t,repo:n,branch:r,base:i,force:a=!1,message:o,fileChanges:s}){let c=O(i),l=await T(e,{owner:t,repo:n,baseRef:c,targetRef:`refs/heads/${r}`});if(!l)throw Error(`Repository "${t}/${n}" not found`);let u=`commit`in i?i.commit:A(l.baseRef);if(!u)throw Error(`Could not determine sha for base ref "${c}"`);let d=l.targetBranch?.target?.oid??null,f=async(t,n)=>{let r=await E(e,{input:{branch:{id:t},expectedHeadOid:u,message:D(o),fileChanges:s}});if(r.createCommitOnBranch?.ref?.id==null)throw Error(`Failed to create commit on branch "${n}"`);if(r.createCommitOnBranch?.commit?.oid==null)throw Error(`Failed to determine commit sha for commit on branch "${n}"`);return{commitSha:r.createCommitOnBranch.commit.oid}};if(d==null){let i=(await e.rest.git.createRef({owner:t,repo:n,ref:`refs/heads/${r}`,sha:u})).data.node_id;if(!i)throw Error(`Failed to create branch "${r}"`);return await f(i,r),{refId:i}}if(d===u){let e=l.targetBranch.id;return await f(e,r),{refId:e}}if(a){let i=`changesets-ghcommit-temp/${r}`;try{let{tempRefId:a}=await j({octokit:e,owner:t,repo:n,tempBranch:i,baseSha:u}),{commitSha:o}=await f(a,i),s=(await e.rest.git.updateRef({owner:t,repo:n,ref:`heads/${r}`,sha:o,force:!0})).data.node_id;if(!s)throw Error(`Failed to force update branch "${r}"`);return{refId:s}}finally{await e.rest.git.deleteRef({owner:t,repo:n,ref:`heads/${i}`})}}else throw Error(`Branch "${r}" exists but its HEAD does not match the base ${u} and \`force\` is set to false`)}function A(e){return e?.target?`target`in e.target?e.target.target.oid:e.target.oid:null}async function j({octokit:e,owner:t,repo:n,tempBranch:r,baseSha:i}){try{let a=(await e.rest.git.createRef({owner:t,repo:n,ref:`refs/heads/${r}`,sha:i})).data.node_id;if(!a)throw Error(`Failed to create temporary branch "${r}"`);return{tempRefId:a}}catch(a){if(!M(a))throw a;let o=(await e.rest.git.updateRef({owner:t,repo:n,ref:`heads/${r}`,sha:i,force:!0})).data.node_id;if(!o)throw Error(`Failed to force update temporary branch "${r}"`);return{tempRefId:o}}}function M(e){return typeof e==`object`&&!!e&&`status`in e&&`message`in e&&typeof e.status==`number`&&typeof e.message==`string`&&e.status===422&&e.message.includes(`Reference already exists`)}async function N({cwd:e,filterFiles:t,...n}){e=y.resolve(e??process.cwd());let r=O(n.base??{commit:`HEAD`}),i=await F(e,r);if(!i)throw Error(`Could not determine sha for ref ${r}`);return await k({...n,fileChanges:await P(e,i,t),base:{commit:i}})}async function P(e,t,n){let r=await I(e),i=[],a=[],o=async e=>{if(n&&!n(e))return;let t=y.join(r,e),a=await S.lstat(t);if(a.isSymbolicLink())throw Error(`Unexpected symlink at ${e}, GitHub API only supports files and directories. You may need to add this file to .gitignore`);if(a.mode&73)throw Error(`Unexpected executable file at ${e}, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore`);i.push({path:e,contents:await S.readFile(t,`base64`)})},s=e=>{n&&!n(e)||a.push({path:e})},[c,l]=await Promise.all([_(`git`,[`diff`,`--name-status`,`--diff-filter=ACDMRT`,t],{throwOnError:!0,nodeOptions:{cwd:r}}),_(`git`,[`ls-files`,`--others`,`--exclude-standard`],{throwOnError:!0,nodeOptions:{cwd:r}})]);for(let e of c.stdout.trim().split(`
`)){if(!e)continue;let[t,...n]=e.split(`	`);if(t.startsWith(`R`)||t.startsWith(`C`)){let[e,t]=n;s(e),await o(t);continue}let r=n[0];t===`D`?s(r):await o(r)}for(let e of l.stdout.trim().split(`
`))e&&await o(e);return i.sort((e,t)=>e.path>t.path?1:-1),a.sort((e,t)=>e.path>t.path?1:-1),{additions:i,deletions:a}}async function F(e,t){try{let{stdout:n}=await _(`git`,[`rev-parse`,t],{throwOnError:!0,nodeOptions:{cwd:e}});return n.trim()}catch{return null}}async function I(e){try{let{stdout:t}=await _(`git`,[`rev-parse`,`--git-dir`],{throwOnError:!0,nodeOptions:{cwd:e}});return y.dirname(y.resolve(e,t.trim()))}catch{return e}}var ee=n(e(),1),te=`0.0.0-development`,L=()=>Promise.resolve();function R(e,t,n){return e.retryLimiter.schedule(z,e,t,n)}async function z(e,t,n){let{pathname:r}=new URL(n.url,`http://github.test`),i=B(n.method,r),a=!i&&n.method!==`GET`&&n.method!==`HEAD`,o=n.method===`GET`&&r.startsWith(`/search/`),s=r.startsWith(`/graphql`),c=~~t.retryCount>0?{priority:0,weight:0}:{};e.clustering&&(c.expiration=6e4),(a||s)&&await e.write.key(e.id).schedule(c,L),a&&e.triggersNotification(r)&&await e.notifications.key(e.id).schedule(c,L),o&&await e.search.key(e.id).schedule(c,L);let l=(i?e.auth:e.global).key(e.id).schedule(c,t,n);if(s){let e=await l;if(e.data.errors!=null&&e.data.errors.some(e=>e.type===`RATE_LIMITED`))throw Object.assign(Error(`GraphQL Rate Limit Exceeded`),{response:e,data:e.data})}return l}function B(e,t){return e===`PATCH`&&/^\/applications\/[^/]+\/token\/scoped$/.test(t)||e===`POST`&&(/^\/applications\/[^/]+\/token$/.test(t)||/^\/app\/installations\/[^/]+\/access_tokens$/.test(t)||t===`/login/oauth/access_token`)}var V=[`/orgs/{org}/invitations`,`/orgs/{org}/invitations/{invitation_id}`,`/orgs/{org}/teams/{team_slug}/discussions`,`/orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments`,`/repos/{owner}/{repo}/collaborators/{username}`,`/repos/{owner}/{repo}/commits/{commit_sha}/comments`,`/repos/{owner}/{repo}/issues`,`/repos/{owner}/{repo}/issues/{issue_number}/comments`,`/repos/{owner}/{repo}/issues/{issue_number}/sub_issue`,`/repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority`,`/repos/{owner}/{repo}/pulls`,`/repos/{owner}/{repo}/pulls/{pull_number}/comments`,`/repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`,`/repos/{owner}/{repo}/pulls/{pull_number}/merge`,`/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`,`/repos/{owner}/{repo}/pulls/{pull_number}/reviews`,`/repos/{owner}/{repo}/releases`,`/teams/{team_id}/discussions`,`/teams/{team_id}/discussions/{discussion_number}/comments`];function H(e){let t=`^(?:${e.map(e=>e.split(`/`).map(e=>e.startsWith(`{`)?`(?:.+?)`:e).join(`/`)).map(e=>`(?:${e})`).join(`|`)})[^/]*$`;return new RegExp(t,`i`)}var U=H(V),W=U.test.bind(U),G={},K=function(e,t){G.global=new e.Group({id:`octokit-global`,maxConcurrent:10,...t}),G.auth=new e.Group({id:`octokit-auth`,maxConcurrent:1,...t}),G.search=new e.Group({id:`octokit-search`,maxConcurrent:1,minTime:2e3,...t}),G.write=new e.Group({id:`octokit-write`,maxConcurrent:1,minTime:1e3,...t}),G.notifications=new e.Group({id:`octokit-notifications`,maxConcurrent:1,minTime:3e3,...t})};function q(e,t){let{enabled:n=!0,Bottleneck:r=ee.default,id:i=`no-id`,timeout:a=12e4,connection:o}=t.throttle||{};if(!n)return{};let s={timeout:a};o!==void 0&&(s.connection=o);let c=Object.assign({clustering:o!=null,triggersNotification:W,fallbackSecondaryRateRetryAfter:60,retryAfterBaseValue:1e3,id:i},t.throttle);if(typeof c.onSecondaryRateLimit!=`function`||typeof c.onRateLimit!=`function`)throw Error(`octokit/plugin-throttling error:
        You must pass the onSecondaryRateLimit and onRateLimit error handlers.
        See https://octokit.github.io/rest.js/#throttling

        const octokit = new Octokit({
          throttle: {
            onSecondaryRateLimit: (retryAfter, options) => {/* ... */},
            onRateLimit: (retryAfter, options) => {/* ... */}
          }
        })
    `);let l=!1,u=()=>{if(l)return;l=!0,G.global??K(r,s),c.global=c.global??G.global,c.auth=c.auth??G.auth,c.search=c.search??G.search,c.write=c.write??G.write,c.notifications=c.notifications??G.notifications,c.retryLimiter=c.retryLimiter??new r;let t={},n=new r.Events(t);t.on(`secondary-limit`,c.onSecondaryRateLimit),t.on(`rate-limit`,c.onRateLimit),t.on(`error`,t=>e.log.warn(`Error in throttling-plugin limit handler`,t)),c.retryLimiter.on(`failed`,async function(t,r){let[i,a,o]=r.args,{pathname:s}=new URL(o.url,`http://github.test`);if(!(s.startsWith(`/graphql`)&&t.status!==401||t.status===403||t.status===429))return;let c=~~a.retryCount;a.retryCount=c,o.request.retryCount=c;let{wantRetry:l,retryAfter:u=0}=await(async function(){if(/\bsecondary rate\b/i.test(t.message)){let r=Number(t.response.headers[`retry-after`])||i.fallbackSecondaryRateRetryAfter;return{wantRetry:await n.trigger(`secondary-limit`,r,o,e,c),retryAfter:r}}if(t.response.headers!=null&&t.response.headers[`x-ratelimit-remaining`]===`0`||(t.response.data?.errors??[]).some(e=>e.type===`RATE_LIMITED`)){let r=new Date(~~t.response.headers[`x-ratelimit-reset`]*1e3).getTime(),i=Math.max(Math.ceil((r-Date.now())/1e3)+1,0);return{wantRetry:await n.trigger(`rate-limit`,i,o,e,c),retryAfter:i}}return{}})();if(l)return a.retryCount++,u*i.retryAfterBaseValue})};return e.hook.wrap(`request`,(e,t)=>(u(),R(c,e,t))),{}}q.VERSION=te,q.triggersNotification=W;const J=e=>o(e,{throttle:{onRateLimit:(e,t,n,i)=>{if(r(`Request quota exhausted for request ${t.method} ${t.url}`),i<=2)return f(`Retrying after ${e} seconds!`),!0},onSecondaryRateLimit:(e,t,n,i)=>{if(r(`SecondaryRateLimit detected for request ${t.method} ${t.url}`),i<=2)return f(`Retrying after ${e} seconds!`),!0}}},q),Y=async(e,t)=>{await i(`git`,[`push`,`origin`,`HEAD:${e}`,`--force`],t)},X=async(e,t)=>{let{stderr:n}=await a(`git`,[`checkout`,e],{ignoreReturnCode:!0,...t});n.toString().includes(`Switched to a new branch '${e}'`)||await i(`git`,[`checkout`,`-b`,e],t)},Z=async(e,t)=>{await i(`git`,[`reset`,`--hard`,e],t)},ne=async(e,t)=>{await i(`git`,[`add`,`.`],t),await i(`git`,[`commit`,`-m`,e],t)},re=async e=>{let{stdout:t}=await a(`git`,[`status`,`--porcelain`],e);return!t.length};function ie(e){try{let t=new URL(e);return t.protocol!==`http:`&&t.protocol!==`https:`?void 0:(t.password=``,t.search=``,t.hash=``,t.href)}catch{return}}var ae=class{#e;octokit;cwd;pushWithGitCli;serverUrl;constructor(e){this.#e=e.githubToken,this.cwd=e.cwd,this.pushWithGitCli=e.pushWithGitCli??!1,this.serverUrl=(e.serverUrl??g.serverUrl??process.env.GITHUB_SERVER_URL??`https://github.com`).replace(/\/+$/,``),this.octokit=J(e.githubToken)}getToken(){return this.#e}async#t(){let e=b.from(`x-access-token:${this.#e}`).toString(`base64`),t=Number(process.env.GIT_CONFIG_COUNT??0);if(!Number.isInteger(t)||t<0)throw Error(`Invalid GIT_CONFIG_COUNT value: ${process.env.GIT_CONFIG_COUNT}`);let{stdout:n}=await a(`git`,[`remote`,`get-url`,`--push`,`--all`,`origin`],{cwd:this.cwd,ignoreReturnCode:!0,silent:!0}),r=new Set([`http.${this.serverUrl}/.extraheader`]);for(let e of n.split(/\r?\n/)){let t=ie(e);t!==void 0&&r.add(`http.${t}.extraheader`)}let i=`AUTHORIZATION: basic ${e}`,o={GIT_CONFIG_COUNT:String(t+r.size*2)},s=0;for(let e of r){let n=t+s*2,r=n+1;o[`GIT_CONFIG_KEY_${n}`]=e,o[`GIT_CONFIG_VALUE_${n}`]=``,o[`GIT_CONFIG_KEY_${r}`]=e,o[`GIT_CONFIG_VALUE_${r}`]=i,s++}return o}async ensureGitUser(){let e=await a(`git`,[`-c`,`user.useConfigOnly=true`,`var`,`GIT_AUTHOR_IDENT`],{cwd:this.cwd,ignoreReturnCode:!0,silent:!0}),t=await a(`git`,[`-c`,`user.useConfigOnly=true`,`var`,`GIT_COMMITTER_IDENT`],{cwd:this.cwd,ignoreReturnCode:!0,silent:!0});(e.exitCode!==0||t.exitCode!==0)&&(f(`Setting git user to github-actions[bot]`),await i(`git`,[`config`,`user.name`,`"github-actions[bot]"`],{cwd:this.cwd}),await i(`git`,[`config`,`user.email`,`"41898282+github-actions[bot]@users.noreply.github.com"`],{cwd:this.cwd}))}async pushTag(e){try{this.pushWithGitCli?await i(`git`,[`push`,`origin`,e],{cwd:this.cwd,env:{...process.env,...await this.#t()}}):await this.octokit.rest.git.createRef({...g.repo,ref:`refs/tags/${e}`,sha:g.sha})}catch(t){r(`Failed to create git tag "${e}". Assuming it was manually pushed by the publish script: ${t.message}`)}}async prepareBranch(e){await X(e,{cwd:this.cwd}),await Z(g.sha,{cwd:this.cwd})}async pushChanges({branch:e,message:t}){if(!this.pushWithGitCli){await N({octokit:this.octokit,...g.repo,branch:e,message:t,base:{commit:g.sha},force:!0,cwd:this.cwd});return}await re({cwd:this.cwd})||(await this.ensureGitUser(),await ne(t,{cwd:this.cwd})),await Y(e,{cwd:this.cwd,env:{...process.env,...await this.#t()}})}};const oe=async(e,{pkg:t,tagName:n})=>{let r;try{r=await S.readFile(C.join(t.dir,`CHANGELOG.md`),`utf8`)}catch(e){if(p(e,`ENOENT`))return;throw e}let i=d(r,t.packageJson.version);if(!i)throw Error(`Could not find changelog entry for ${t.packageJson.name}@${t.packageJson.version}`);await e.rest.repos.createRelease({name:n,tag_name:n,body:i.content,prerelease:t.packageJson.version.includes(`-`),...g.repo})};var Q=class extends Error{};function $(e){return typeof e==`object`&&!!e}function se(e){return $(e)&&`type`in e&&e.type===`git-tag`&&`tag`in e&&typeof e.tag==`string`&&`packageName`in e&&typeof e.packageName==`string`}async function ce(e){let t;try{t=await S.readFile(e,`utf8`)}catch(t){throw new Q(`Failed to read changesets output at ${e}`,{cause:t})}let n=[],r=0;for(;r<=t.length;){let e=t.indexOf(`
`,r);e===-1&&(e=t.length);let i=t.slice(r,e);if(r=e+1,/^\s*$/.test(i))continue;let a;try{a=JSON.parse(i)}catch(e){throw Error(`Failed to parse changesets output event: ${i}`,{cause:e})}se(a)&&n.push(a)}return n}async function le({script:e,fromPackDir:t,github:n,createGithubReleases:i,pushGitTags:o,cwd:l}){let{octokit:u}=n;await n.ensureGitUser();let d,f=C.join(process.env.RUNNER_TEMP??await S.realpath(w.tmpdir()),`changesets-output-${x()}.ndjson`),p={cwd:l,ignoreReturnCode:!0,env:{...process.env,GITHUB_TOKEN:n.getToken(),CHANGESETS_OUTPUT:f}};if(e)d=await a(e,void 0,p);else{let e=[`publish`];t&&e.push(`--from-pack-dir`,t),d=await s(e,p)}let{packages:m,tool:h}=await c(l),g=new Map(m.map(e=>[e.packageJson.name,e])),_;try{_=await ce(f)}catch(t){if(!e||!(t instanceof Q))throw t;r(`${t.message}. GitHub releases and git tags cannot be created without this output. Ensure the custom publish script passes CHANGESETS_OUTPUT to the Changesets CLI.`),_=[]}let v=_.map(e=>{let t=g.get(e.packageName);if(t===void 0)throw Error(`Package "${e.packageName}" not found.This is probably a bug in the action, please open an issue`);return{pkg:t,tag:e.tag}});if(h.type===`root`&&m.length===0)throw Error(`No package found.This is probably a bug in the action, please open an issue`);return(i||o)&&await Promise.all(v.map(async({pkg:e,tag:t})=>{o&&await n.pushTag(t),i&&await oe(u,{pkg:e,tagName:t})})),v.length?{published:!0,publishedPackages:v.map(({pkg:e})=>({name:e.packageJson.name,version:e.packageJson.version})),exitCode:d.exitCode}:{published:!1,exitCode:d.exitCode}}async function ue({hasPublishScript:e,preState:t,changedPackagesInfo:n,prBodyMaxCharacters:r,branch:i}){let a=`This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${e?`the packages will be published to npm automatically`:`publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`}. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${i}, this PR will be updated.
`,o=t?`⚠️⚠️⚠️⚠️⚠️⚠️

\`${i}\` is currently in **pre mode** so this branch has prereleases rather than normal releases. If you want to exit prereleases, run \`changeset pre exit\` on \`${i}\`.

⚠️⚠️⚠️⚠️⚠️⚠️
`:``,s=`# Releases`,c=[a,o,s,...n.map(e=>`${e.header}\n\n${e.content}`)].join(`
`);return c.length>r&&(c=[a,o,s,`
> The changelog information of each package has been omitted from this message, as the content exceeds the size limit.
`,...n.map(e=>`${e.header}\n\n`)].join(`
`)),c.length>r&&(c=[a,o,s,`
> All release information have been omitted from this message, as the content exceeds the size limit.`].join(`
`)),c}async function de({script:e,github:n,cwd:r=process.cwd(),prTitle:a=`Version Packages`,commitMessage:o=`Version Packages`,hasPublishScript:s=!1,prBodyMaxCharacters:c=6e4,branch:p=g.ref.replace(`refs/heads/`,``),prDraft:_}){let{octokit:y}=n,b=`changeset-release/${p}`,{preState:x}=await v(r);await n.prepareBranch(b);let w=await l(r),T={...process.env,GITHUB_TOKEN:n.getToken()};e?await i(e,void 0,{cwd:r,env:T}):await m([`version`],{cwd:r,env:T});let E=await h(r,w),D=Promise.all(E.map(async e=>{let t=await S.readFile(C.join(e.dir,`CHANGELOG.md`),`utf8`),n=d(t,e.packageJson.version);return{highestLevel:n.highestLevel,private:!!e.packageJson.private,content:n.content,header:`## ${e.packageJson.name}@${e.packageJson.version}`}})),O=`${a}${x?` (${x.tag})`:``}`,k=`${o}${x?` (${x.tag})`:``}`,A=await y.rest.pulls.list({...g.repo,state:`open`,head:`${g.repo.owner}:${b}`,base:p});t(`Existing pull requests: ${JSON.stringify(A.data,null,2)}`),await n.pushChanges({branch:b,message:k});let j=await ue({hasPublishScript:s,preState:x,branch:p,changedPackagesInfo:(await D).filter(e=>e).sort(u),prBodyMaxCharacters:c});if(A.data.length===0){f(`Creating pull request`);let{data:e}=await y.rest.pulls.create({base:p,head:b,title:O,body:j,draft:_!==void 0,...g.repo});return{pullRequestNumber:e.number}}{let[e]=A.data;f(`Updating found pull request #${e.number}`);let t=`
      mutation UpdatePullRequest(
        $pullRequestId: ID!
        $title: String!
        $body: String!
      ) {
        ${_===`always`?`
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
    `;return await y.graphql(t,{pullRequestId:e.node_id,title:O,body:j}),{pullRequestNumber:e.number}}}export{de as n,ae as r,le as t};
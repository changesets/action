import{T as e,_ as t,a as n,f as r,g as i,i as a,t as o,v as s}from"./manypkg-get-packages-BoFCbqAx.js";import{o as c}from"./dist-IQHIouET.js";import{a as l,d as u,i as d,l as f,m as p,n as m,o as h,u as g}from"./utils-DxGVktYo.js";import{t as ee}from"./readChangesetState-wtnwjhXS.js";import _ from"node:fs/promises";import v from"path";import{Buffer as y}from"node:buffer";import{randomUUID as b}from"node:crypto";import x from"node:path";import S from"node:os";const C=async(e,t)=>(await e.graphql(`
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
`,t)).repository,w=async(e,t)=>e.graphql(`
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
`,t);function T(e){if(typeof e==`object`)return{headline:e.headline.trim(),body:e.body?.trim()};if(!e.includes(`
`))return{headline:e.trim()};let[t,...n]=e.split(`
`);return{headline:t.trim(),body:n.join(`
`).trim()}}function E(e){return`branch`in e?`refs/heads/${e.branch}`:`tag`in e?`refs/tags/${e.tag}`:e.commit}async function D({octokit:e,owner:t,repo:n,branch:r,base:i,force:a=!1,message:o,fileChanges:s}){let c=E(i),l=await C(e,{owner:t,repo:n,baseRef:c,targetRef:`refs/heads/${r}`});if(!l)throw Error(`Repository "${t}/${n}" not found`);let u=`commit`in i?i.commit:O(l.baseRef);if(!u)throw Error(`Could not determine sha for base ref "${c}"`);let d=l.targetBranch?.target?.oid??null,f=async(t,n)=>{let r=await w(e,{input:{branch:{id:t},expectedHeadOid:u,message:T(o),fileChanges:s}});if(r.createCommitOnBranch?.ref?.id==null)throw Error(`Failed to create commit on branch "${n}"`);if(r.createCommitOnBranch?.commit?.oid==null)throw Error(`Failed to determine commit sha for commit on branch "${n}"`);return{commitSha:r.createCommitOnBranch.commit.oid}};if(d==null){let i=(await e.rest.git.createRef({owner:t,repo:n,ref:`refs/heads/${r}`,sha:u})).data.node_id;if(!i)throw Error(`Failed to create branch "${r}"`);return await f(i,r),{refId:i}}else if(d===u){let e=l.targetBranch.id;return await f(e,r),{refId:e}}else if(a){let i=`changesets-ghcommit-temp/${r}`;try{let{tempRefId:a}=await k({octokit:e,owner:t,repo:n,tempBranch:i,baseSha:u}),{commitSha:o}=await f(a,i),s=(await e.rest.git.updateRef({owner:t,repo:n,ref:`heads/${r}`,sha:o,force:!0})).data.node_id;if(!s)throw Error(`Failed to force update branch "${r}"`);return{refId:s}}finally{await e.rest.git.deleteRef({owner:t,repo:n,ref:`heads/${i}`})}}else throw Error(`Branch "${r}" exists but its HEAD does not match the base ${u} and \`force\` is set to false`)}function O(e){return e?.target?`target`in e.target?e.target.target.oid:e.target.oid:null}async function k({octokit:e,owner:t,repo:n,tempBranch:r,baseSha:i}){try{let a=(await e.rest.git.createRef({owner:t,repo:n,ref:`refs/heads/${r}`,sha:i})).data.node_id;if(!a)throw Error(`Failed to create temporary branch "${r}"`);return{tempRefId:a}}catch(a){if(!A(a))throw a;let o=(await e.rest.git.updateRef({owner:t,repo:n,ref:`heads/${r}`,sha:i,force:!0})).data.node_id;if(!o)throw Error(`Failed to force update temporary branch "${r}"`);return{tempRefId:o}}}function A(e){return typeof e==`object`&&!!e&&`status`in e&&`message`in e&&typeof e.status==`number`&&typeof e.message==`string`&&e.status===422&&e.message.includes(`Reference already exists`)}async function j({cwd:e,filterFiles:t,...n}){e=v.resolve(e??process.cwd());let r=E(n.base??{commit:`HEAD`}),i=await N(e,r);if(!i)throw Error(`Could not determine sha for ref ${r}`);return await D({...n,fileChanges:await M(e,i,t),base:{commit:i}})}async function M(e,t,n){let r=await P(e),i=[],a=[],o=async e=>{if(n&&!n(e))return;let t=v.join(r,e),a=await _.lstat(t);if(a.isSymbolicLink())throw Error(`Unexpected symlink at ${e}, GitHub API only supports files and directories. You may need to add this file to .gitignore`);if(a.mode&73)throw Error(`Unexpected executable file at ${e}, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore`);i.push({path:e,contents:await _.readFile(t,`base64`)})},s=e=>{n&&!n(e)||a.push({path:e})},[l,u]=await Promise.all([c(`git`,[`diff`,`--name-status`,`--diff-filter=ACDMRT`,t],{throwOnError:!0,nodeOptions:{cwd:r}}),c(`git`,[`ls-files`,`--others`,`--exclude-standard`],{throwOnError:!0,nodeOptions:{cwd:r}})]);for(let e of l.stdout.trim().split(`
`)){if(!e)continue;let[t,...n]=e.split(`	`);if(t.startsWith(`R`)||t.startsWith(`C`)){let[e,t]=n;s(e),await o(t);continue}let r=n[0];t===`D`?s(r):await o(r)}for(let e of u.stdout.trim().split(`
`))e&&await o(e);return i.sort((e,t)=>e.path>t.path?1:-1),a.sort((e,t)=>e.path>t.path?1:-1),{additions:i,deletions:a}}async function N(e,t){try{let{stdout:n}=await c(`git`,[`rev-parse`,t],{throwOnError:!0,nodeOptions:{cwd:e}});return n.trim()}catch{return null}}async function P(e){try{let{stdout:t}=await c(`git`,[`rev-parse`,`--git-dir`],{throwOnError:!0,nodeOptions:{cwd:e}});return v.dirname(v.resolve(e,t.trim()))}catch{return e}}var F=e(p(),1),I=`0.0.0-development`,L=()=>Promise.resolve();function R(e,t,n){return e.retryLimiter.schedule(z,e,t,n)}async function z(e,t,n){let{pathname:r}=new URL(n.url,`http://github.test`),i=B(n.method,r),a=!i&&n.method!==`GET`&&n.method!==`HEAD`,o=n.method===`GET`&&r.startsWith(`/search/`),s=r.startsWith(`/graphql`),c=~~t.retryCount>0?{priority:0,weight:0}:{};e.clustering&&(c.expiration=1e3*60),(a||s)&&await e.write.key(e.id).schedule(c,L),a&&e.triggersNotification(r)&&await e.notifications.key(e.id).schedule(c,L),o&&await e.search.key(e.id).schedule(c,L);let l=(i?e.auth:e.global).key(e.id).schedule(c,t,n);if(s){let e=await l;if(e.data.errors!=null&&e.data.errors.some(e=>e.type===`RATE_LIMITED`))throw Object.assign(Error(`GraphQL Rate Limit Exceeded`),{response:e,data:e.data})}return l}function B(e,t){return e===`PATCH`&&/^\/applications\/[^/]+\/token\/scoped$/.test(t)||e===`POST`&&(/^\/applications\/[^/]+\/token$/.test(t)||/^\/app\/installations\/[^/]+\/access_tokens$/.test(t)||t===`/login/oauth/access_token`)}var V=[`/orgs/{org}/invitations`,`/orgs/{org}/invitations/{invitation_id}`,`/orgs/{org}/teams/{team_slug}/discussions`,`/orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments`,`/repos/{owner}/{repo}/collaborators/{username}`,`/repos/{owner}/{repo}/commits/{commit_sha}/comments`,`/repos/{owner}/{repo}/issues`,`/repos/{owner}/{repo}/issues/{issue_number}/comments`,`/repos/{owner}/{repo}/issues/{issue_number}/sub_issue`,`/repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority`,`/repos/{owner}/{repo}/pulls`,`/repos/{owner}/{repo}/pulls/{pull_number}/comments`,`/repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies`,`/repos/{owner}/{repo}/pulls/{pull_number}/merge`,`/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`,`/repos/{owner}/{repo}/pulls/{pull_number}/reviews`,`/repos/{owner}/{repo}/releases`,`/teams/{team_id}/discussions`,`/teams/{team_id}/discussions/{discussion_number}/comments`];function H(e){let t=`^(?:${e.map(e=>e.split(`/`).map(e=>e.startsWith(`{`)?`(?:.+?)`:e).join(`/`)).map(e=>`(?:${e})`).join(`|`)})[^/]*$`;return new RegExp(t,`i`)}var U=H(V),W=U.test.bind(U),G={},K=function(e,t){G.global=new e.Group({id:`octokit-global`,maxConcurrent:10,...t}),G.auth=new e.Group({id:`octokit-auth`,maxConcurrent:1,...t}),G.search=new e.Group({id:`octokit-search`,maxConcurrent:1,minTime:2e3,...t}),G.write=new e.Group({id:`octokit-write`,maxConcurrent:1,minTime:1e3,...t}),G.notifications=new e.Group({id:`octokit-notifications`,maxConcurrent:1,minTime:3e3,...t})};function q(e,t){let{enabled:n=!0,Bottleneck:r=F.default,id:i=`no-id`,timeout:a=1e3*60*2,connection:o}=t.throttle||{};if(!n)return{};let s={timeout:a};o!==void 0&&(s.connection=o),G.global??K(r,s);let c=Object.assign({clustering:o!=null,triggersNotification:W,fallbackSecondaryRateRetryAfter:60,retryAfterBaseValue:1e3,retryLimiter:new r,id:i,...G},t.throttle);if(typeof c.onSecondaryRateLimit!=`function`||typeof c.onRateLimit!=`function`)throw Error(`octokit/plugin-throttling error:
        You must pass the onSecondaryRateLimit and onRateLimit error handlers.
        See https://octokit.github.io/rest.js/#throttling

        const octokit = new Octokit({
          throttle: {
            onSecondaryRateLimit: (retryAfter, options) => {/* ... */},
            onRateLimit: (retryAfter, options) => {/* ... */}
          }
        })
    `);let l={},u=new r.Events(l);return l.on(`secondary-limit`,c.onSecondaryRateLimit),l.on(`rate-limit`,c.onRateLimit),l.on(`error`,t=>e.log.warn(`Error in throttling-plugin limit handler`,t)),c.retryLimiter.on(`failed`,async function(t,n){let[r,i,a]=n.args,{pathname:o}=new URL(a.url,`http://github.test`);if(!(o.startsWith(`/graphql`)&&t.status!==401||t.status===403||t.status===429))return;let s=~~i.retryCount;i.retryCount=s,a.request.retryCount=s;let{wantRetry:c,retryAfter:l=0}=await(async function(){if(/\bsecondary rate\b/i.test(t.message)){let n=Number(t.response.headers[`retry-after`])||r.fallbackSecondaryRateRetryAfter;return{wantRetry:await u.trigger(`secondary-limit`,n,a,e,s),retryAfter:n}}if(t.response.headers!=null&&t.response.headers[`x-ratelimit-remaining`]===`0`||(t.response.data?.errors??[]).some(e=>e.type===`RATE_LIMITED`)){let n=new Date(~~t.response.headers[`x-ratelimit-reset`]*1e3).getTime(),r=Math.max(Math.ceil((n-Date.now())/1e3)+1,0);return{wantRetry:await u.trigger(`rate-limit`,r,a,e,s),retryAfter:r}}return{}})();if(c)return i.retryCount++,l*r.retryAfterBaseValue}),e.hook.wrap(`request`,R.bind(null,c)),{}}q.VERSION=I,q.triggersNotification=W;const J=e=>n(e,{throttle:{onRateLimit:(e,t,n,a)=>{if(i(`Request quota exhausted for request ${t.method} ${t.url}`),a<=2)return r(`Retrying after ${e} seconds!`),!0},onSecondaryRateLimit:(e,t,n,a)=>{if(i(`SecondaryRateLimit detected for request ${t.method} ${t.url}`),a<=2)return r(`Retrying after ${e} seconds!`),!0}}},q),Y=async(e,n)=>{await t(`git`,[`push`,`origin`,`HEAD:${e}`,`--force`],n)},X=async(e,n)=>{let{stderr:r}=await s(`git`,[`checkout`,e],{ignoreReturnCode:!0,...n});r.toString().includes(`Switched to a new branch '${e}'`)||await t(`git`,[`checkout`,`-b`,e],n)},Z=async(e,n)=>{await t(`git`,[`reset`,`--hard`,e],n)},Q=async(e,n)=>{await t(`git`,[`add`,`.`],n),await t(`git`,[`commit`,`-m`,e],n)},te=async e=>{let{stdout:t}=await s(`git`,[`status`,`--porcelain`],e);return!t.length};var ne=class{#e;octokit;cwd;commitMode;constructor(e){this.#e=e.githubToken,this.cwd=e.cwd,this.commitMode=e.commitMode??`git-cli`,this.octokit=J(e.githubToken)}getToken(){return this.#e}#t(){let e=y.from(`x-access-token:${this.#e}`).toString(`base64`),t=(a.serverUrl??process.env.GITHUB_SERVER_URL??`https://github.com`).replace(/\/+$/,``),n=Number(process.env.GIT_CONFIG_COUNT??0);if(!Number.isInteger(n)||n<0)throw Error(`Invalid GIT_CONFIG_COUNT value: ${process.env.GIT_CONFIG_COUNT}`);return{GIT_CONFIG_COUNT:String(n+1),[`GIT_CONFIG_KEY_${n}`]:`http.${t}/.extraheader`,[`GIT_CONFIG_VALUE_${n}`]:`AUTHORIZATION: basic ${e}`}}async setupUser(){this.commitMode!==`github-api`&&(await t(`git`,[`config`,`user.name`,`"github-actions[bot]"`],{cwd:this.cwd}),await t(`git`,[`config`,`user.email`,`"41898282+github-actions[bot]@users.noreply.github.com"`],{cwd:this.cwd}))}async pushTag(e){if(this.commitMode===`github-api`)return this.octokit.rest.git.createRef({...a.repo,ref:`refs/tags/${e}`,sha:a.sha}).catch(t=>{i(`Failed to create tag ${e}: ${t.message}`)});await t(`git`,[`push`,`origin`,e],{cwd:this.cwd,env:{...process.env,...this.#t()}})}async prepareBranch(e){this.commitMode!==`github-api`&&(await X(e,{cwd:this.cwd}),await Z(a.sha,{cwd:this.cwd}))}async pushChanges({branch:e,message:t}){if(this.commitMode===`github-api`){await j({octokit:this.octokit,...a.repo,branch:e,message:t,base:{commit:a.sha},cwd:this.cwd});return}await te({cwd:this.cwd})||await Q(t,{cwd:this.cwd}),await Y(e,{cwd:this.cwd,env:{...process.env,...this.#t()}})}};const re=async(e,{pkg:t,tagName:n})=>{let r;try{r=await _.readFile(x.join(t.dir,`CHANGELOG.md`),`utf8`)}catch(e){if(g(e,`ENOENT`))return;throw e}let i=l(r,t.packageJson.version);if(!i)throw Error(`Could not find changelog entry for ${t.packageJson.name}@${t.packageJson.version}`);await e.rest.repos.createRelease({name:n,tag_name:n,body:i.content,prerelease:t.packageJson.version.includes(`-`),...a.repo})};function $(e){return typeof e==`object`&&!!e}function ie(e){return $(e)&&`type`in e&&e.type===`git-tag`&&`tag`in e&&typeof e.tag==`string`&&`packageName`in e&&typeof e.packageName==`string`}async function ae(e){let t;try{t=await _.readFile(e,`utf8`)}catch(t){throw Error(`Failed to read changesets output at ${e}`,{cause:t})}let n=[],r=0;for(;r<=t.length;){let e=t.indexOf(`
`,r);e===-1&&(e=t.length);let i=t.slice(r,e);if(r=e+1,/^\s*$/.test(i))continue;let a;try{a=JSON.parse(i)}catch(e){throw Error(`Failed to parse changesets output event: ${i}`,{cause:e})}ie(a)&&n.push(a)}return n}async function oe({script:e,fromPackDir:t,github:n,createGithubReleases:r,pushGitTags:i,cwd:a}){let{octokit:c}=n,l,u=x.join(process.env.RUNNER_TEMP??await _.realpath(S.tmpdir()),`changesets-output-${b()}.ndjson`),d={cwd:a,ignoreReturnCode:!0,env:{...process.env,GITHUB_TOKEN:n.getToken(),CHANGESETS_OUTPUT:u}};if(e)l=await s(e,void 0,d);else{let e=[`publish`];t&&e.push(`--from-pack-dir`,t),l=await h(e,d)}let{packages:f,tool:p}=await o(a),m=new Map(f.map(e=>[e.packageJson.name,e])),g=(await ae(u)).map(e=>{let t=m.get(e.packageName);if(t===void 0)throw Error(`Package "${e.packageName}" not found.This is probably a bug in the action, please open an issue`);return{pkg:t,tag:e.tag}});if(p.type===`root`&&f.length===0)throw Error(`No package found.This is probably a bug in the action, please open an issue`);return(r||i)&&await Promise.all(g.map(async({pkg:e,tag:t})=>{i&&await n.pushTag(t),r&&await re(c,{pkg:e,tagName:t})})),g.length?{published:!0,publishedPackages:g.map(({pkg:e})=>({name:e.packageJson.name,version:e.packageJson.version})),exitCode:l.exitCode}:{published:!1,exitCode:l.exitCode}}async function se({hasPublishScript:e,preState:t,changedPackagesInfo:n,prBodyMaxCharacters:r,branch:i}){let a=`This PR was opened by the [Changesets release](https://github.com/changesets/action) GitHub action. When you're ready to do a release, you can merge this and ${e?`the packages will be published to npm automatically`:`publish to npm yourself or [setup this action to publish automatically](https://github.com/changesets/action#with-publishing)`}. If you're not ready to do a release yet, that's fine, whenever you add more changesets to ${i}, this PR will be updated.
`,o=t?`⚠️⚠️⚠️⚠️⚠️⚠️

\`${i}\` is currently in **pre mode** so this branch has prereleases rather than normal releases. If you want to exit prereleases, run \`changeset pre exit\` on \`${i}\`.

⚠️⚠️⚠️⚠️⚠️⚠️
`:``,s=`# Releases`,c=[a,o,s,...n.map(e=>`${e.header}\n\n${e.content}`)].join(`
`);return c.length>r&&(c=[a,o,s,`
> The changelog information of each package has been omitted from this message, as the content exceeds the size limit.
`,...n.map(e=>`${e.header}\n\n`)].join(`
`)),c.length>r&&(c=[a,o,s,`
> All release information have been omitted from this message, as the content exceeds the size limit.`].join(`
`)),c}async function ce({script:e,github:n,cwd:i=process.cwd(),prTitle:o=`Version Packages`,commitMessage:s=`Version Packages`,hasPublishScript:c=!1,prBodyMaxCharacters:p=6e4,branch:h=a.ref.replace(`refs/heads/`,``),prDraft:g}){let{octokit:v}=n,y=`changeset-release/${h}`,{preState:b}=await ee(i);await n.prepareBranch(y);let S=await f(i),C={...process.env,GITHUB_TOKEN:n.getToken()};e?await t(e,void 0,{cwd:i,env:C}):await m([`version`],{cwd:i,env:C});let w=await d(i,S),T=Promise.all(w.map(async e=>{let t=l(await _.readFile(x.join(e.dir,`CHANGELOG.md`),`utf8`),e.packageJson.version);return{highestLevel:t.highestLevel,private:!!e.packageJson.private,content:t.content,header:`## ${e.packageJson.name}@${e.packageJson.version}`}})),E=`${o}${b?` (${b.tag})`:``}`,D=`${s}${b?` (${b.tag})`:``}`,O=await v.rest.pulls.list({...a.repo,state:`open`,head:`${a.repo.owner}:${y}`,base:h});r(`Existing pull requests: ${JSON.stringify(O.data,null,2)}`),await n.pushChanges({branch:y,message:D});let k=await se({hasPublishScript:c,preState:b,branch:h,changedPackagesInfo:(await T).filter(e=>e).sort(u),prBodyMaxCharacters:p});if(O.data.length===0){r(`creating pull request`);let{data:e}=await v.rest.pulls.create({base:h,head:y,title:E,body:k,draft:g!==void 0,...a.repo});return{pullRequestNumber:e.number}}else{let[e]=O.data;r(`updating found pull request #${e.number}`);let t=`
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
    `;return await v.graphql(t,{pullRequestId:e.node_id,title:E,body:k}),{pullRequestNumber:e.number}}}export{ce as n,ne as r,oe as t};
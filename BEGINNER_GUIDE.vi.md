# Hướng dẫn nhanh cho người mới: `changesets/action`

## 1) Repo này làm gì?

Đây là mã nguồn của GitHub Action `changesets/action`. Action này tự động hóa 2 luồng chính:

- **Version PR**: tạo/cập nhật pull request chứa thay đổi version + changelog từ Changesets.
- **Publish**: khi không còn changeset cần xử lý, chạy lệnh publish và xuất output các package đã phát hành.

Điểm vào runtime là `src/index.ts`: đọc input từ workflow, quyết định đi nhánh `runVersion` hay `runPublish`, và set outputs cho step của GitHub Actions.

## 2) Cấu trúc thư mục quan trọng

- `src/index.ts`: điều phối toàn bộ luồng của action.
- `src/run.ts`: nghiệp vụ chính cho **version** (tạo PR) và **publish** (đọc output publish, tạo GitHub release).
- `src/git.ts`: lớp `Git` trừu tượng thao tác git, hỗ trợ 2 chế độ commit (`git-cli` và `github-api`).
- `src/utils.ts`: hàm tiện ích như đọc changelog entry, xác định package đổi version, sort hiển thị PR body.
- `src/readChangesetState.ts`: đọc trạng thái changeset và xử lý `pre mode`.
- `src/*.test.ts` + `src/__snapshots__`: test chính bằng Vitest.
- `action.yml`: định nghĩa input/output cho GitHub Action.

## 3) Luồng chạy tổng quát (mental model)

1. Action lấy token + input (`publish`, `version`, `commitMode`, `cwd`, ...).
2. Đọc danh sách changeset hiện có.
3. Rẽ nhánh:
   - **Có changeset**: chạy luồng version (`runVersion`) → commit/push vào nhánh release → tạo hoặc cập nhật PR.
   - **Không có changeset nhưng có `publish` script**: chạy luồng publish (`runPublish`) → parse kết quả publish → set output `published`/`publishedPackages`.
   - **Không có cả changeset lẫn publish script**: kết thúc sớm.
4. Set outputs để workflow phía trên dùng tiếp.

## 4) Những điểm quan trọng cần nắm

- **`commitMode` ảnh hưởng cách ghi commit**:
  - `git-cli`: dùng git local (`git add/commit/push`).
  - `github-api`: dùng API (`@changesets/ghcommit`) để commit đã ký GPG theo token owner.
- **Giới hạn độ dài PR body**: có cơ chế cắt bớt nội dung changelog để tránh vượt limit payload GitHub.
- **`pre mode` của Changesets**: được phát hiện và hiển thị cảnh báo trong PR body.
- **Khả năng publish linh hoạt**:
  - ưu tiên `.npmrc` có sẵn;
  - tự thêm auth line khi có `NPM_TOKEN`;
  - fallback sang trusted publishing khi có OIDC env.
- **Tạo GitHub Releases là tùy chọn** (`createGithubReleases`) và phụ thuộc package/tag được phát hiện từ output publish.

## 5) Cách đọc code hiệu quả cho người mới

- Bắt đầu từ `src/index.ts` để hiểu router điều kiện.
- Sau đó đọc `runVersion` và `runPublish` trong `src/run.ts`.
- Khi thấy thao tác git/network, nhảy sang `src/git.ts` và `src/octokit.ts`.
- Cuối cùng đọc test `src/run.test.ts`, `src/utils.test.ts` để xem các edge-case và expected behavior.

## 6) Gợi ý học tiếp theo

- **Changesets core concepts**: changeset file, versioning, pre-release mode.
- **GitHub Actions runtime**: input/output, environment, token model.
- **Octokit/GitHub REST API**: pull requests, releases, rate limit + retry.
- **Testing strategy**: snapshot testing, fixture-based tests cho các case nhiều package.
- **Monorepo package tooling**: `@manypkg/get-packages` và cách phân biệt root package vs workspace packages.

Nếu mới hoàn toàn, hãy chạy test trước khi sửa code (`yarn test`), rồi thử trace một test case trong `src/run.test.ts` để bám theo toàn bộ luồng.

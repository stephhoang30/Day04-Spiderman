# Day 04 Lab v2 Report — Research Agent

> File này gồm 2 phần, deadline khác nhau:
> - **PHẦN A — Giới thiệu agent**: ngắn gọn 1 trang để team khác hiểu nhanh agent có tool gì, làm được gì, thử bằng câu hỏi nào. Xong trước 11:30 để làm tài liệu phụ trợ khi demo.
> - **PHẦN B — Chi tiết / Bằng chứng**: bảng đầy đủ (v0–v3, failure, eval, chat) dựa trên log thật. Có thể hoàn thiện sau buổi debate để nộp bài.

## Team

- Team: Spiderman
- Members:
Nguyễn Quý Dương - 2A202601642  
Trần Văn Ngọc - 2A202601512  
Hoàng Công Thành - 2A202601662  
Nguyễn Hoàng Bảo Minh - 2A202601626  
Hồ Văn Tâm - 2A202601542

- Provider/model: OpenAI GPT-4o-mini via OpenAI provider

---

# PHẦN A — Giới thiệu agent

## A1. Agent này làm được gì

> Agent này dùng để chạy các tác vụ research nhỏ: tìm tin tức, đọc tweet/timeline, đọc URL, và tóm tắt kết quả bằng tool routing. Mục tiêu của lab là không chỉ trả lời mà còn phải chọn đúng tool, truyền đúng args, và biết khi nào nên hỏi lại.

**Link dùng thử (truy cập được trong showdown):**

> Demo có thể chạy local bằng chat hoặc eval. Nếu nhóm dựng UI, dán URL ở đây.
>
> URL: local run via `python chat.py --provider openai --version v0`

## A2. Tool agent có

> Liệt kê các tool agent đang dùng. Mỗi tool 1 dòng: tên + làm được gì.

| Tên tool | Làm được gì | Tool mới nhóm thêm? |
|---|---|---|
| clarify | hỏi lại người dùng khi thiếu thông tin hoặc khi cần xác nhận trước hành động nhạy cảm | không |
| timeline | lấy các bài đăng gần đây của một tài khoản mạng xã hội | không |
| lookup | tra cứu thông tin trên web theo chủ đề/tin tức | không |
| fetch | đọc nội dung từ URL đã được cung cấp | không |
| format | tóm tắt và trình bày kết quả thành digest | không |

## A3. Câu hỏi mẫu để thử

> 3–5 câu hỏi/yêu cầu mẫu để team khác tự thử agent ngay.

1. "Tin AI hôm nay có gì nổi bật?"
2. "Cho mình 3 tweet gần nhất của Elon Musk, nhưng chỉ lấy những bài nói về SpaceX hoặc Tesla"
3. "Tóm tắt giúp mình bài viết này, nhưng đừng tự đoán link—nếu thiếu địa chỉ thì hãy hỏi lại trước"
4. "Đăng bản tin này lên Telegram cho mình, nhưng trước khi làm hãy hỏi xác nhận lại một lần"
5. "Tin AI hôm nay có gì? Đừng dùng câu trả lời chung chung"


---

# PHẦN B — Chi tiết / Bằng chứng

> Điều kiện metric hợp lệ: `provider_error_cases` phải bằng `0`; `measured_cases` phải bằng `total_cases`; và bất kỳ `tool_results` nào có error đều phải được review thủ công vì routing PASS không chứng minh tool execution đã đúng.

## B1. Version evidence

Fill from `artifacts/version_log.csv` and `runs/*.json`.

> Metric chỉ hợp lệ khi `provider_error_cases=0` và `measured_cases=total_cases`.
> Run group v3 dùng OpenAI đã chạy lúc 17:54 nhưng 10/10 case lỗi HTTP 401
> (invalid API key), nên không có metric để so sánh.

| Version | Prompt/tool change | Hypothesis | Metric name | Before | After | Run File |
|---|---|---|---|---:|---:|---|
| v0 | baseline; dùng prompt/tool starter và 10 case nhóm mới | Baseline để đo routing/tool/args trên group eval | case_accuracy | 0.60 | 0.60 | runs/v0_B_group_openai_20260729T161319244168.json |
| v1 | Prompt/tool bổ sung rule `clarify` cho handle và URL bị thiếu | Không tự đoán input bắt buộc | case_accuracy | 0.60 | N/A — 11 provider errors, 9/20 measured | runs/v1_B_base_openai_20260729T173745711076.json |
| v2 | Thêm guardrail xác nhận trước `send` | Không gọi side-effect tool khi chưa xác nhận | case_accuracy | 0.60 | N/A — 15 provider errors, 5/20 measured | runs/v2_B_base_openai_20260729T173809305429.json |
| v3 | Chạy OpenAI group eval theo lệnh yêu cầu | Kiểm tra cấu hình v3 trên 10 case nhóm | case_accuracy | 0.60 | N/A — 10 provider errors, 0/10 measured; HTTP 401 invalid API key | Run tạm v3_B_group_openai_20260729T175408914584.json, đã xóa để tuân thủ giới hạn 2 file |

## B2. Failure analysis

Use actual failures from `results[*].result.failures`.

| Case ID | Failure Type | Actual Tool Calls | What Failed | Fix |
|---|---|---|---|---|
| G01_news_lookup | wrong_tool | lookup(query=AI model news), lookup(query=AI startup news) | Agent over-specified the query and split the request into two tool calls instead of one precise lookup | Tighten prompt/tool description to prefer one concise lookup query |
| G02_timeline_limit | wrong_arg_value | timeline(screenname=elonmusk, limit=5) + extra social_search calls | Agent ignored the explicit limit=3 and used extra social_search calls | Strengthen tool instruction that timeline should respect the requested limit and avoid extra tools |
| G06_multiturn_news_shift | wrong_tool | lookup(query=robotics, topic=news, timeframe=day) + lookup(query=robotics, topic=news, timeframe=week) | Agent added an extra stale-timeframe lookup | Use the latest turn's timeframe and avoid duplicate calls |
| G10_multiturn_boundary | wrong_boundary | boundary handling did not match expected yes_no clarification | Multi-turn boundary case needed stronger confirmation behavior | Update instruction to preserve confirmation boundary across turns |

List the 10 cases added to `data/eval_group.json`:

- 5 single-turn
- 5 multi-turn

This section is for the mandatory team-authored eval set. Optional built-ins do
not belong here.

File template để trống có chủ đích; nhóm phải tự thiết kế đủ 10 case.

| Case ID | What It Tests | Expected Tool/Behavior | Result |
|---|---|---|---|
| G01_news_lookup | News lookup routing | lookup with query=AI and topic=news/timeframe=day | Fail |
| G02_timeline_limit | Timeline arg handling | timeline with screenname=elonmusk and limit=3 | Fail |
| G03_clarify_missing_url | Missing URL clarification | clarify(response_type=text) | Pass |
| G04_no_tool_meta | Meta question no-tool | no_tool | Pass |
| G05_confirm_before_send | Send confirmation boundary | clarify(response_type=yes_no) | Pass |
| G06_multiturn_news_shift | Multi-turn news shift | lookup for robotics with day/news | Fail |
| G07_multiturn_timeline_correction | Multi-turn correction | timeline for karpathy | Pass |
| G08_multiturn_clarify_then_url | Multi-turn URL recovery | fetch the supplied URL | Pass |
| G09_multiturn_no_tool | Multi-turn simple question | no_tool | Pass |
| G10_multiturn_boundary | Multi-turn send boundary | clarify yes_no | Fail |

Use `transcripts/*.transcript.json`.

| Scenario/Turn | Version | Tool Calls + Args | Transcript/Run | Outcome |
|---|---|---|---|---|
|  |  |  |  |  |

## B5. Tool capability evidence

Phân loại rõ tool mới bắt buộc, optional built-in và tool đủ điều kiện bonus. Chỉ ghi Telegram/PDF nếu nhóm thực sự dùng; base report không cần chúng.

UI is core deliverable, not bonus. Do not list it here.

| Category | Evidence File | What Worked | Risk / Guardrail |
|---|---|---|---|
| Must-have: tool mới đầu tiên |  |  |  |
| Optional built-in |  |  |  |
| Bonus: tool mới thứ 4 trở đi |  |  |  |

## B6. Reflection

- Which fixes belonged in `system_prompt.md`? The confirmation boundary and the instruction to avoid over-splitting a request into multiple lookup calls belong here.
- Which fixes belonged in `tools.yaml`? The tool descriptions for timeline, fetch, and clarify should be stronger so the model knows when to ask for missing information and when to preserve the requested limit.
- Which failure needed manual review instead of automatic grading? Cases involving extra tool calls or ambiguous argument values needed review because routing could appear partially correct even when the underlying tool arguments were wrong.
- What would you improve next? Tighten the prompt and tool descriptions, then rerun v1 and compare the new metrics against the v0 baseline.

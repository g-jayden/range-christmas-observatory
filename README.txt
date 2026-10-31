The Range 圣诞树与树裙目录研究

公开商品目录研究；树与树裙独立统计；来源：https://www.therange.co.uk/christmas/christmas-trees/
全量云端采集可设每隔3、5或7天及北京时间时分；默认每隔7天00:00。新品独立于每周三北京时间07:00检查并推送。只有完整类目核对通过才发布数据，商品规格按具体SKU校验，图片使用原站真实照片。
采集账号密钥仅存GitHub Actions加密Secret，仓库与网页不含密钥。
日程由GitHub Actions执行，可能受云端排队影响；实际采集完成时间与属性核验时间在网页分别显示。
首次部署数据是已验证目录快照；是否已执行全量云端更新，以status.json、Actions记录及网页状态为准。
与The Range无隶属关系；SKU供给结构不代表销量。


Configurable refresh and NEW notifications
- GitHub Pages remains the permanent public report. The former daily full-refresh cron has been removed.
- schedule-monitor.yml wakes every 5 minutes; a private Cloudflare control service determines whether the selected 3/5/7-day full refresh is due, and whether the independent Wednesday07:00 Asia/Shanghai NEW scan is due. GitHub scheduling can be delayed and is not an exact-minute SLA.
- Cloudflare Durable Objects (SQLite) hold global schedule, private subscriptions, NEW history and delivery outbox. Only the administrator can change the global schedule. Email addresses are never committed or put in public JSON.
- Defaults: every 7 days at 00:00 Asia/Shanghai. Saving a plan starts its first cycle N calendar days after the save date, then repeats from the scheduled date. Changing the plan while a full refresh runs does not overwrite the new plan. Failed full scans do not advance the plan.
- The public API base is in web/service.json. The same base is configured as the GitHub variable CONTROL_API_URL. CONTROL_TOKEN is a GitHub and Cloudflare server secret; ADMIN_TOKEN, BREVO_API_KEY and MAIL_FROM exist only as Cloudflare secrets. Never commit values.
- Brevo sends confirmation, NEW snapshot emails and unsubscribe links. Recipients must explicitly confirm their address. Existing baseline NEW products are not sent as newly launched. Source snapshots are verified against the rendered exact SKU before a screenshot is sent. Source screenshot URLs are downloaded into the private outbox before expiry, attached to email, and shown as an unlisted preview for 14 days.
- Mocked tests exercise privacy, authorization and deduplication. Claim delivery only after a real provider acceptance and recipient inbox check; queued or generated messages are not proof of receipt.
- Firecrawl quota must cover the independent monitor as well as periodic full refreshes. Source errors and insufficient credits are shown, never reported as no new products.

NEW schedule changed by user: run one source check every Wednesday at07:00 Asia/Shanghai, then send newly found NEW products. Both former15-minute polling and proposed daily checks are cancelled. The5-minute controller wake only checks due times and does not itself scrape products. Source failures are reported and the next Wednesday check remains scheduled. Unsubscribe-by-email is public, immediate and returns a generic result without disclosing subscriber membership; associated pending confirmation tokens are invalidated.

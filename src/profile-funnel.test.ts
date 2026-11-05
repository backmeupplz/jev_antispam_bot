import { describe, expect, test } from "bun:test";
import { funnelChannel, profileChannelFunnel } from "./profile-funnel";
import { funnelIncident, funnelProfiles, ordinaryProfiles } from "./fixtures/profile-funnel";

const message = (text: string, extra: object = {}) => ({ text, embeddedLinks: [], isForwarded: false, ...extra });

describe("#470 profile channel funnel", () => {
  for (const { id, text, profile } of funnelProfiles) test("funnel: " + id, () => {
    expect(funnelChannel(profile)).toBe(true);
    expect(profileChannelFunnel(message(text), profile)).toBe(true);
  });

  for (const { id, text, profile } of ordinaryProfiles) test("kept: " + id, () => {
    expect(profileChannelFunnel(message(text), profile)).toBe(false);
  });

  test("the sender's own text only: no forward, no uncaptioned media, no empty text", () => {
    const { profile } = funnelIncident;
    expect(profileChannelFunnel(message(funnelIncident.text, { isForwarded: true }), profile)).toBe(false);
    expect(profileChannelFunnel(message("", { mediaOnly: true }), profile)).toBe(false);
    expect(profileChannelFunnel(message("  "), profile)).toBe(false);
    // Any comment counts: the profile, not the words, is the ad.
    for (const text of ["👍", "Great point, thanks for sharing", "This is honestly terrifying. Stay safe everyone."])
      expect(profileChannelFunnel(message(text), profile)).toBe(true);
  });

  test("a second destination, a handle or a later post breaks the lone-funnel shape", () => {
    const [teaser, created] = funnelIncident.profile.personalChannel!.posts!;
    const withPost = (changes: object) => ({ personalChannel: { title: "t", posts: [{ ...teaser!, ...changes }, created!] } });
    expect(funnelChannel(withPost({}))).toBe(true);
    expect(funnelChannel(withPost({ text: teaser!.text + " https://t.me/+AnotherInvite" }))).toBe(false);
    expect(funnelChannel(withPost({ embeddedLinks: [...teaser!.embeddedLinks, "https://t.me/synthetic_public"] }))).toBe(false);
    // One website may come with the invite (the same site, however written, is one); two may not.
    expect(funnelChannel(withPost({ embeddedLinks: [...teaser!.embeddedLinks, "https://synthetic.example/", "http://WWW.Synthetic.example"] }))).toBe(true);
    expect(funnelChannel(withPost({ embeddedLinks: [...teaser!.embeddedLinks, "https://synthetic.example/", "https://other.example/"] }))).toBe(false);
    expect(funnelChannel(withPost({ text: teaser!.text + " DM @synthetic_owner" }))).toBe(false);
    expect(funnelChannel(withPost({ url: "https://t.me/synthetic_channel/11" }))).toBe(false);
    expect(funnelChannel(withPost({ url: "https://t.me/synthetic_channel/10" }))).toBe(true);
    expect(funnelChannel(withPost({ url: "https://t.me/synthetic_channel/x" }))).toBe(false);
    // A private invite hash is case-sensitive; the host is not.
    expect(funnelChannel(withPost({ embeddedLinks: ["HTTPS://T.ME/+SyntheticInvite01"] }))).toBe(true);
    expect(funnelChannel(withPost({ embeddedLinks: ["https://t.me/+syntheticinvite01"] }))).toBe(false);
  });

  test("non-ASCII hosts stay whole: three sites are not one", () => {
    const [teaser, created] = funnelIncident.profile.personalChannel!.posts!;
    const withLinks = (text: string, embeddedLinks: string[]) => ({ personalChannel: { title: "t", posts: [{ ...teaser!, text, embeddedLinks }, created!] } });
    const sites = ["https://школа.рф", "https://курсы.рф", "https://дипломы.рф"];
    expect(funnelChannel(withLinks("Наши курсы и школа https://t.me/+AbCdEf123 " + sites.join(" "), ["https://t.me/+AbCdEf123", ...sites]))).toBe(false);
    expect(funnelChannel(withLinks("Наши курсы и школа https://t.me/+AbCdEf123 " + sites[0], ["https://t.me/+AbCdEf123", sites[0]!]))).toBe(true);
    // A glued emoji or bracket ends a bare host, and the same site written twice is one.
    expect(funnelChannel(withLinks("Курсы для взрослых (https://школа.рф) и группа https://t.me/+AbCdEf123 https://ШКОЛА.рф👇", ["https://t.me/+AbCdEf123"]))).toBe(true);
  });

  test("a URL glued to a website hides no second destination", () => {
    const [teaser, created] = funnelIncident.profile.personalChannel!.posts!;
    const withText = (text: string, embeddedLinks: string[] = []) => ({ personalChannel: { title: "t", posts: [{ ...teaser!, text, embeddedLinks }, created!] } });
    for (const tail of ["https://site.example👉https://t.me/publicchan", "https://site.example—тут:https://t.me/+Other999", "https://site.example,https://t.me/publicchan"]) {
      const text = "Hot pics every day 👇 https://t.me/+AbCdEf123 " + tail;
      expect(funnelChannel(withText(text))).toBe(false);
      // As the page extractor would hand them over: each text URL as one embedded link.
      expect(funnelChannel(withText("Hot pics every day 👇", ["https://t.me/+AbCdEf123", tail]))).toBe(false);
    }
    expect(funnelChannel(withText("Hot pics every day 👇 https://t.me/+AbCdEf123 https://site.example👉"))).toBe(true);
  });

  test("a channel that only points at the owner's own channel or group is not a teaser", () => {
    const [teaser, created] = funnelIncident.profile.personalChannel!.posts!;
    const withText = (text: string) => ({ personalChannel: { title: "t", posts: [{ ...teaser!, text: text + " https://t.me/+AbC", embeddedLinks: ["https://t.me/+AbC"] }, created!] } });
    for (const text of ["Мой основной канал тут 👇", "My main channel is here", "This is my private channel 💗", "Наш новый чат, переходите", "Asosiy kanalim 👇", "Join our group here", "It’s my backup channel",
      "Мой телеграм канал 👇", "My telegram channel", "Подпишитесь на мой канал", "Вступайте в нашу группу", "Check out my channel",
      "Kanalimga obuna bo'ling", "Kanalimga obuna bo‘ling", "Kanalimga obuna boʻling"])
      expect(funnelChannel(withText(text))).toBe(false);
    for (const text of ["I'm getting naked on my main channel right now, don't miss it", "Come closer, little trouble 😈👇", "Wanna take a bite? 😈👉"])
      expect(funnelChannel(withText(text))).toBe(true);
  });

  test("long adversarial posts stay linear", () => {
    for (const text of ["word ".repeat(300) + "t.me/" + "a".repeat(5000), "https://" + "я".repeat(1200), "https://a" + "/".repeat(1200),
      "https://".repeat(150), "t.me/+a ".repeat(150), "https://x.example/" + ".,".repeat(600), "мой ".repeat(300)]) {
      const start = performance.now();
      funnelChannel({ personalChannel: { title: "t", posts: [{ url: "https://t.me/s/3", text, embeddedLinks: [text.slice(0, 512)] }] } });
      expect(performance.now() - start).toBeLessThan(200);
    }
  });
});

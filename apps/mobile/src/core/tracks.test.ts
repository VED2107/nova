import assert from "node:assert/strict";
import { test } from "node:test";
import type { Track } from "../playback/types.ts";
import { sameLanguage, startTracks } from "./tracks.ts";

const t = (id: string, kind: Track["kind"], language: string | null, isSelected = false): Track => ({ id, kind, label: id, language, isSelected });
const film = [t("a-ja", "audio", "jpn", true), t("a-en", "audio", "eng"), t("s-en", "subtitle", "en"), t("s-fr", "subtitle", "fre")];

test("language codes of either length and locales match", () => {
  assert.ok(sameLanguage("eng", "en-GB"));
  assert.ok(sameLanguage("fre", "fr"));
  assert.ok(!sameLanguage("eng", "fr-FR"));
  assert.ok(!sameLanguage(null, "en"));
  assert.ok(sameLanguage("tlh", "tlh"));
});

test("file's own choice is kept by default", () => {
  assert.deepEqual(startTracks(film, { audioLang: "file", subtitlesStart: "file" }, "en-US"), {});
});

test("device language audio wins and then needs no subtitles", () => {
  assert.deepEqual(startTracks(film, { audioLang: "device", subtitlesStart: "device" }, "en-US"), { audio: "a-en" });
});

test("foreign audio gets subtitles in the device language", () => {
  assert.deepEqual(startTracks(film, { audioLang: "file", subtitlesStart: "device" }, "fr-FR"), { subtitle: "s-fr" });
  assert.deepEqual(startTracks(film, { audioLang: "device", subtitlesStart: "device" }, "de-DE"), {}, "nothing in German: leave it");
});

test("off turns a default subtitle track off", () => {
  const forced = [t("a", "audio", "eng", true), t("s", "subtitle", "eng", true)];
  assert.deepEqual(startTracks(forced, { audioLang: "file", subtitlesStart: "off" }, "en"), { subtitle: null });
  assert.deepEqual(startTracks(film, { audioLang: "file", subtitlesStart: "off" }, "en"), {});
});

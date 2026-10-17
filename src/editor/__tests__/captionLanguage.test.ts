import { fillersSpoken, phoneLanguage } from "../captionLanguage";

const spy = (locale: unknown) => jest.spyOn(Intl, "DateTimeFormat").mockImplementation((() => ({ resolvedOptions: () => ({ locale }) })) as never);
afterEach(() => jest.restoreAllMocks());

test("the phone's language from Intl: the first part, lower case", () => {
  spy("en-GB"); expect(phoneLanguage()).toBe("en"); expect(fillersSpoken()).toBe(true);
  spy("de_DE"); expect(phoneLanguage()).toBe("de"); expect(fillersSpoken()).toBe(false);
  spy("ZH-Hans"); expect(phoneLanguage()).toBe("zh");
});

test("a language that cannot be read counts as English (Hermes always answers)", () => {
  spy(undefined); expect(phoneLanguage()).toBeNull(); expect(fillersSpoken()).toBe(true);
  jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => { throw new Error("no Intl"); });
  expect(phoneLanguage()).toBeNull(); expect(fillersSpoken()).toBe(true);
});

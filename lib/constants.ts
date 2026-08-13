import { CompanyName, SiteName } from "./types";

export const SITE_DIRECTORY: { site: SiteName; company: CompanyName }[] = [
        { site: 'Friendship Site', company: 'Cappadocia' },
        { site: 'Lideta Site', company: 'Cappadocia' },
        { site: 'JFK Site', company: 'Cappadocia' },
        { site: '4 Kilo Site', company: 'Addisu Habte' },
        { site: 'Bole Site', company: 'Addisu Habte' },
        { site: 'Summit Site', company: 'Addisu Habte' },
        { site: 'Meskel Flower Site', company: 'Vila Verde' },
        { site: 'Senga Tera Site', company: 'Vila Verde' },
    ];
export const STOREKEEPER_ACCOUNTS: { username: string; site: SiteName; nameAm: string; nameEn: string }[] = [
        { username: 'SK1', site: 'Friendship Site', nameAm: 'ፍሬንድሺፕ ሳይት እቃ ግምጃ ቤት', nameEn: 'Friendship Site Storekeeper' },
        { username: 'SK2', site: 'Lideta Site', nameAm: 'ልደታ ሳይት እቃ ግምጃ ቤት', nameEn: 'Lideta Site Storekeeper' },
        { username: 'SK3', site: 'JFK Site', nameAm: 'ጄኤፍኬ ሳይት እቃ ግምጃ ቤት', nameEn: 'JFK Site Storekeeper' },
        { username: 'SK4', site: '4 Kilo Site', nameAm: '4 ኪሎ ሳይት እቃ ግምጃ ቤት', nameEn: '4 Kilo Site Storekeeper' },
        { username: 'SK5', site: 'Bole Site', nameAm: 'ቦሌ ሳይት እቃ ግምጃ ቤት', nameEn: 'Bole Site Storekeeper' },
        { username: 'SK6', site: 'Summit Site', nameAm: 'ሰሚት ሳይት እቃ ግምጃ ቤት', nameEn: 'Summit Site Storekeeper' },
        { username: 'SK7', site: 'Meskel Flower Site', nameAm: 'መስቀል ፍላወር ሳይት እቃ ግምጃ ቤት', nameEn: 'Meskel Flower Site Storekeeper' },
        { username: 'SK8', site: 'Senga Tera Site', nameAm: 'ሰንጋ ተራ ሳይት እቃ ግምጃ ቤት', nameEn: 'Senga Tera Site Storekeeper' },
    ];
export const FINANCE_DESKS: { username: string; company: CompanyName; nameAm: string; nameEn: string }[] = [
        { username: 'FIN1', company: 'Cappadocia', nameAm: 'ፋይናንስ 1', nameEn: 'Finance Desk 1' },
        { username: 'FIN2', company: 'Addisu Habte', nameAm: 'ፋይናንስ 2', nameEn: 'Finance Desk 2' },
        { username: 'FIN3', company: 'Vila Verde', nameAm: 'ፋይናንስ 3', nameEn: 'Finance Desk 3' },
    ];

export const SUBCON_ACCOUNTS: { username: string; site: SiteName; nameAm: string; nameEn: string }[] = [
        { username: 'SUBCON1', site: 'Friendship Site', nameAm: 'ሳብ ኮንትራክተር 1', nameEn: 'Subcontractor 1' },
    ];
export const getCompanyForSite = (site: string): CompanyName => {
        return SITE_DIRECTORY.find(entry => entry.site === site)?.company ?? 'Cappadocia';
    };

'use strict';

const ARTIFACT_SOURCES = {
    IN: {
        authority: 'Central Board of Indirect Taxes and Customs / ICEGATE',
        url: 'https://foservices.icegate.gov.in/cip/cip/',
        mode: 'operator_export',
        note: 'Export the complete current tariff with explicit BCD, SWS and IGST columns.'
    },
    KR: {
        authority: 'Korea Customs Service',
        url: 'https://www.customs.go.kr/english/ad/ct/CustomsTariffList.do',
        mode: 'official_query_export',
        note: 'Use the complete current 10-digit KCS tariff schedule, not an FTA concession excerpt.'
    },
    MY: {
        authority: 'Royal Malaysian Customs Department',
        url: 'https://ezhs.customs.gov.my/',
        mode: 'operator_export',
        note: 'Obtain the complete current 10-digit AHTN schedule; an amendment or SST list is not sufficient.'
    },
    VN: {
        authority: 'Vietnam Customs',
        url: 'https://www.customs.gov.vn/',
        mode: 'operator_export',
        note: 'Obtain the complete current 8-digit MFN schedule; amendment-only PDFs are rejected.'
    },
    TW: {
        authority: 'Customs Administration, Ministry of Finance',
        url: 'https://web.customs.gov.tw/singlehtml/1205?cntId=cus1_112173_1205',
        mode: 'official_download',
        note: 'Use the current complete tariff-rate download and retain the official 11-digit statistical code.'
    },
    RU: {
        authority: 'Eurasian Economic Commission',
        url: 'https://eec.eaeunion.org/en/comission/direction/tam_sotr/dep_tamoj_zak/tptssp.php',
        mode: 'operator_export',
        note: 'Obtain the complete current 10-digit EAEU Common Customs Tariff; sanctions remain a separate screen.'
    }
};

module.exports = { ARTIFACT_SOURCES };

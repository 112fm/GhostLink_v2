BEGIN;

DELETE FROM users;

INSERT INTO users (tg_id,name,status,expiry,expiry_ts,device_limit,tariff_name,balance,last_request_ts) VALUES
('41157235','Anna Sutyagina','active','2026-05-29',strftime('%s','2026-05-29')*1000,2,'Solo',0,strftime('%s','now')*1000),
('938225358','Barbara','active','2026-05-07',strftime('%s','2026-05-07')*1000,4,'Flex 4',0,strftime('%s','now')*1000),
('6531345220','fairytalemistake','active','2026-05-09',strftime('%s','2026-05-09')*1000,4,'Flex 4',0,strftime('%s','now')*1000),
('464859832','Kil_van','active','2026-05-31',strftime('%s','2026-05-31')*1000,4,'Flex 4',0,strftime('%s','now')*1000),
('940505388','Miki','active','2026-05-28',strftime('%s','2026-05-28')*1000,2,'Solo',0,strftime('%s','now')*1000),
('1399542202','Kindlr','active','2026-05-07',strftime('%s','2026-05-07')*1000,2,'Solo',0,strftime('%s','now')*1000),
('1464959929','Алексей Юдаев','active','2026-05-21',strftime('%s','2026-05-21')*1000,2,'Solo',0,strftime('%s','now')*1000),
('909446975','pretendent1','active','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Solo',0,strftime('%s','now')*1000),
('842558770','ematveevaa','active','2026-05-24',strftime('%s','2026-05-24')*1000,2,'Solo',0,strftime('%s','now')*1000),
('1105775844','For_XxXx','active','2026-05-29',strftime('%s','2026-05-29')*1000,2,'Solo',0,strftime('%s','now')*1000),
('1019746211','Nikkall11','active','2026-05-18',strftime('%s','2026-05-18')*1000,2,'Solo',0,strftime('%s','now')*1000),
('856190311','Саша','active','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Solo',0,strftime('%s','now')*1000),

('312826672','fm666_0','active','2026-12-31',strftime('%s','2026-12-31')*1000,5,'VIP',0,strftime('%s','now')*1000),
('717670006','djanochkaa0','active','2026-12-31',strftime('%s','2026-12-31')*1000,5,'VIP',0,strftime('%s','now')*1000),
('1054369768','Юля','active','2026-12-31',strftime('%s','2026-12-31')*1000,5,'VIP',0,strftime('%s','now')*1000),
('5364982125','hml_0862','active','2026-12-31',strftime('%s','2026-12-31')*1000,5,'VIP',0,strftime('%s','now')*1000),

('6596805026','Ян','trial','2026-05-08',strftime('%s','2026-05-08')*1000,3,'Trial',0,strftime('%s','now')*1000),

('166347618','MargoshaVet','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('740032531','zenkinakseniya','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('1289057163','mmmikkk_555','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('785230148','AleksandrSouI','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('1326669494','Andrusha1317','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('1019773440','ZenkinD85','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('747212726','kkkk8kkkkk','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('900404980','Koks7_08','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('1163855426','slkvipok88','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('1948304979','USDYQ','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('5642078875','NeeBiM0ZGi','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('1753551347','Abdin_Yuri','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('178542458','Alik_Rostov','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('5248588977','Андрей','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('5219310966','Kross345','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('876522907','tema_kintsel','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('1031685742','Викиш','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('916582417','ugakimdi','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('701976361','irina1975kis','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('1530549245','DK_Gorodna','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('921421756','Jasper_kasper','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('822103151','Мария','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('1366058933','milanachagarova','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('390182001','Наталья Цырульникова','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('950285683','anastez1aaaa','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('841669550','sofaaleshkovna','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('912873900','blizkreak','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000),
('5500577486','FatiI508ma','trial','2026-05-04',strftime('%s','2026-05-04')*1000,2,'Trial',0,strftime('%s','now')*1000),
('5358493171','Kitov09','trial','2026-05-04',strftime('%s','2026-05-04')*1000,3,'Trial',0,strftime('%s','now')*1000);

COMMIT;

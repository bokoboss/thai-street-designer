/** Status-bar hint for the Connect Road tool, including why a click did nothing. */
export function linkModeHint(hasStart:boolean,clickedObject=false):string{
  if(hasStart)return 'คลิกวงกลมที่ปลายขาของอีกทางแยกหนึ่งเพื่อเชื่อม หรือกด Esc เพื่อยกเลิก';
  return clickedObject
    ?'โหมดเชื่อมถนนรับเฉพาะวงกลมที่ปลายขาทางแยก · กด Esc หรือเลือกเครื่องมือ “เลือก” เพื่อเลือกหรือย้ายวัตถุ'
    :'คลิกวงกลมที่ปลายขาทางแยกต้นทางเพื่อเริ่มเชื่อมถนน';
}

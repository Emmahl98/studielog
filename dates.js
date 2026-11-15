const months=['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
export function displayDate(iso){
 const match=String(iso).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
 if(!match||!months[Number(match[2])-1])return iso;
 return `${match[3]?match[3]+'-':''}${months[Number(match[2])-1]}-${match[1]}`;
}
export function inputDate(value){
 const match=String(value).trim().toLowerCase().match(/^(\d{2})-([a-z]{3})-(\d{4})$/);
 if(!match)return value.trim();
 const month=months.indexOf(match[2])+1;
 return month?`${match[3]}-${String(month).padStart(2,'0')}-${match[1]}`:value.trim();
}

// The earlier Network page is retired (roadmap Phase 3 slice 6c): its work continues in /design, which migrates the
// design saved in this browser on first open and can import it again as extra alternatives.
import {redirect} from 'next/navigation';

export default function NetworkPage(){redirect('/design');}

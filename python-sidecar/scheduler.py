"""
Scheduler - APScheduler-based schedule manager for automated agent/team runs.
Integrates with FastAPI's event loop.
"""

import logging
import time
from typing import Dict, Any, List, Optional, Callable, Awaitable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)


class ScheduleManager:
    def __init__(self):
        self._scheduler = AsyncIOScheduler()
        self._execute_fn: Optional[Callable[..., Awaitable]] = None
        self._schedules: Dict[str, Dict[str, Any]] = {}

    def set_execute_fn(self, fn: Callable[..., Awaitable]):
        self._execute_fn = fn

    def start(self):
        if not self._scheduler.running:
            self._scheduler.start()
            logger.info("Scheduler started")

    def stop(self):
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)
            logger.info("Scheduler stopped")

    def add_schedule(self, schedule: Dict[str, Any]):
        schedule_id = schedule["id"]
        trigger_type = schedule.get("trigger_type", "interval")
        trigger_config = schedule.get("trigger_config", {})
        if isinstance(trigger_config, str):
            import json
            try:
                trigger_config = json.loads(trigger_config)
            except Exception:
                trigger_config = {}

        if schedule_id in self._schedules:
            self.remove_schedule(schedule_id)

        if trigger_type == "cron":
            cron_expr = trigger_config.get("expression", "0 * * * *")
            parts = cron_expr.split()
            trigger = CronTrigger(
                minute=parts[0] if len(parts) > 0 else "*",
                hour=parts[1] if len(parts) > 1 else "*",
                day=parts[2] if len(parts) > 2 else "*",
                month=parts[3] if len(parts) > 3 else "*",
                day_of_week=parts[4] if len(parts) > 4 else "*",
            )
        elif trigger_type == "interval":
            seconds = trigger_config.get("seconds", 3600)
            trigger = IntervalTrigger(seconds=seconds)
        else:
            logger.warning(f"Unsupported trigger type: {trigger_type}")
            return

        self._scheduler.add_job(
            self._execute_target,
            trigger=trigger,
            id=schedule_id,
            args=[schedule],
            replace_existing=True,
        )
        self._schedules[schedule_id] = schedule
        logger.info(f"Schedule {schedule_id} added ({trigger_type})")

    def remove_schedule(self, schedule_id: str):
        try:
            self._scheduler.remove_job(schedule_id)
        except Exception:
            pass
        self._schedules.pop(schedule_id, None)
        logger.info(f"Schedule {schedule_id} removed")

    async def sync_schedules(self, schedules: List[Dict[str, Any]]):
        new_ids = {s["id"] for s in schedules}
        for old_id in list(self._schedules.keys()):
            if old_id not in new_ids:
                self.remove_schedule(old_id)
        for s in schedules:
            if s.get("is_active"):
                self.add_schedule(s)

    async def trigger_now(self, schedule_id: str):
        schedule = self._schedules.get(schedule_id)
        if schedule:
            await self._execute_target(schedule)
        else:
            logger.warning(f"Schedule {schedule_id} not found for manual trigger")

    async def _execute_target(self, schedule: Dict[str, Any]):
        if not self._execute_fn:
            logger.warning("No execute function set")
            return

        try:
            await self._execute_fn(
                target_type=schedule.get("target_type", "agent"),
                target_id=schedule.get("target_id", ""),
                schedule_id=schedule["id"],
            )
            logger.info(f"Schedule {schedule['id']} executed successfully")
        except Exception as e:
            logger.error(f"Schedule {schedule['id']} execution failed: {e}")


schedule_manager = ScheduleManager()
